import sys, json, numpy as np
from PIL import Image
d = sys.argv[1]; t = json.load(open(f"{d}/truth.json"))
for k, v in t.items():
    Image.fromarray(np.fromfile(f"{d}/{k}.gray", dtype=np.uint8).reshape(v["h"], v["w"])).save(f"{d}/scan_{k}.png")
