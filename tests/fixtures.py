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
