# Makes the short test songs the browser tests use (sine tones at different loudness), in tests/.fixtures/
import math, os, struct, wave
os.makedirs("tests/.fixtures", exist_ok=True)
def tone(name, amp, freq, secs, rate=22050):
    w = wave.open(f"tests/.fixtures/{name}", "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    beat = int(rate * 0.5)  # a click every half second so analysis finds a tempo of 120
    w.writeframes(b"".join(struct.pack("<h", int(32767 * max(-1, min(1, amp * math.sin(2 * math.pi * freq * i / rate) + (0.6 if i % beat < 60 else 0) * math.sin(i))))) for i in range(rate * secs)))
    w.close()
tone("song.wav", 0.3, 330, 20)
tone("quiet.wav", 0.05, 220, 8)
tone("loud.wav", 0.7, 440, 8)
tone("mid.wav", 0.25, 550, 8)
print("fixtures written")

# drum loops for Auto DJ: a kick on every beat and a hat between, at two close tempos
def beats(name, bpm, secs, rate=22050):
    w = wave.open(f"tests/.fixtures/{name}", "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    n, beat = int(secs * rate), 60 / bpm
    out = bytearray()
    for i in range(n):
        t = i / rate; ph = t % beat; v = 0.0
        if ph < 0.15: v += 0.8 * math.sin(2 * math.pi * (60 + 90 * math.exp(-ph * 30)) * ph) * math.exp(-ph * 18)
        h = (t + beat / 2) % beat
        if h < 0.03: v += 0.25 * (((i * 7919) % 200) / 100 - 1) * math.exp(-h * 120)
        v += 0.12 * math.sin(2 * math.pi * 220 * t)
        out += struct.pack("<h", int(max(-1, min(1, v)) * 30000))
    w.writeframes(bytes(out)); w.close()
beats("beat120.wav", 120, 40)
beats("beat124.wav", 124, 40)

# songs with lyrics inside their tags (just the tag part matters for reading lyrics)
def syncsafe(n): return bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
def id3(frames):
    body = b"".join(fid.encode() + len(data).to_bytes(4, "big") + b"\x00\x00" + data for fid, data in frames)
    return b"ID3\x03\x00\x00" + syncsafe(len(body)) + body
with open("tests/.fixtures/lyrics-plain.mp3", "wb") as f:
    f.write(id3([("TIT2", b"\x03Plain words"), ("USLT", b"\x03eng\x00Line one\nLine two\nLine three")]) + b"\xff\xfb" + b"\x00" * 400)
sylt = b"\x03eng\x02\x01\x00" + b"".join(t.encode() + b"\x00" + ms.to_bytes(4, "big") for t, ms in [("Synced one", 0), ("Synced two", 1500), ("Synced three", 3000)])
with open("tests/.fixtures/lyrics-synced.mp3", "wb") as f:
    f.write(id3([("TIT2", b"\x03Synced words"), ("USLT", b"\x03eng\x00not this one"), ("SYLT", sylt)]) + b"\xff\xfb" + b"\x00" * 400)
def vorbis(comments):
    vendor = b"neon"; out = len(vendor).to_bytes(4, "little") + vendor + len(comments).to_bytes(4, "little")
    for c in comments: b = c.encode(); out += len(b).to_bytes(4, "little") + b
    return out
vc = vorbis(["TITLE=Flac words", "LYRICS=[00:00.00]Flac one\n[00:01.00]Flac two\n[00:02.00]Flac three"])
with open("tests/.fixtures/lyrics.flac", "wb") as f:
    f.write(b"fLaC" + bytes([0x80 | 4]) + len(vc).to_bytes(3, "big") + vc + b"\x00" * 64)
def atom(name, body): return (8 + len(body)).to_bytes(4, "big") + name + body
lyr = atom(b"\xa9lyr", atom(b"data", b"\x00\x00\x00\x01\x00\x00\x00\x00" + "M4a one\nM4a two".encode()))
with open("tests/.fixtures/lyrics.m4a", "wb") as f:
    f.write(atom(b"ftyp", b"M4A \x00\x00\x00\x00") + atom(b"moov", atom(b"udta", atom(b"meta", b"\x00\x00\x00\x00" + atom(b"ilst", lyr)))))
with open("tests/.fixtures/lyrics-txxx.mp3", "wb") as f:  # how ffmpeg writes them
    f.write(id3([("TIT2", b"\x03Txxx words"), ("TXXX", b"\x03USLT\x00Custom one\nCustom two\x00")]) + b"\xff\xfb" + b"\x00" * 400)

def tiny_png(w, h, rgb):
    import zlib
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
# a real FLAC (verbatim frames: simple, but any player decodes it): 3 s of stereo tones, with tags and a cover
def flac_file(path, secs=3.0, rate=44100):
    import math, struct
    def crc8(b):
        c = 0
        for x in b:
            c ^= x
            for _ in range(8): c = ((c << 1) ^ 0x07) & 255 if c & 128 else (c << 1) & 255
        return c
    def crc16(b):
        c = 0
        for x in b:
            c ^= x << 8
            for _ in range(8): c = ((c << 1) ^ 0x8005) & 0xFFFF if c & 0x8000 else (c << 1) & 0xFFFF
        return c
    def utf8num(n):
        if n < 0x80: return bytes([n])
        if n < 0x800: return bytes([0xC0 | n >> 6, 0x80 | n & 63])
        return bytes([0xE0 | n >> 12, 0x80 | (n >> 6) & 63, 0x80 | n & 63])
    total, bs = int(secs * rate), 4096
    L = [int(9000 * math.sin(2 * math.pi * 440 * i / rate)) for i in range(total)]
    R = [int(9000 * math.sin(2 * math.pi * 660 * i / rate)) for i in range(total)]
    si = struct.pack(">HH", bs, bs) + b"\x00\x00\x00\x00\x00\x00"
    v = (rate << 44) | ((2 - 1) << 41) | ((16 - 1) << 36) | total
    si += v.to_bytes(8, "big") + b"\x00" * 16
    cover = tiny_png(16, 16, (224, 32, 32))
    vcb = vorbis(["TITLE=Flac Song", "ARTIST=Aster", "ALBUM=Night Drive", "DATE=2026", "TRACKNUMBER=3"])
    pic = struct.pack(">I", 3) + struct.pack(">I", 9) + b"image/png" + struct.pack(">I", 0) + b"\x00" * 16 + struct.pack(">I", len(cover)) + cover
    blocks = [(0, si), (4, vcb)] + ([(6, pic)] if cover else [])
    out = bytearray(b"fLaC")
    for i, (t, body) in enumerate(blocks): out += bytes([(0x80 if i == len(blocks) - 1 else 0) | t]) + len(body).to_bytes(3, "big") + body
    for fi, start in enumerate(range(0, total, bs)):
        n = min(bs, total - start)
        hdr = bytearray(b"\xff\xf8") + bytes([(0xC if n == bs else 0x7) << 4 | 0x9, 0x1 << 4 | 0x4 << 1]) + utf8num(fi)
        if n != bs: hdr += (n - 1).to_bytes(2, "big")
        hdr += bytes([crc8(hdr)])
        frame = bytearray(hdr)
        for ch in (L, R): frame += b"\x02" + b"".join(struct.pack(">h", s) for s in ch[start:start + n])
        frame += crc16(frame).to_bytes(2, "big")
        out += frame
    open(path, "wb").write(out)
flac_file("tests/.fixtures/song.flac")
