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
