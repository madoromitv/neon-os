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
