import urllib.request
import json
import io
from PIL import Image, ImageDraw, ImageChops
import math

RAINVIEWER_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json"
TILE_SIZE = 512
ZOOM = 6
COLOR_SCHEME = 2
SMOOTH = 1
SNOW = 1

CZECH_BORDER = (
    (16.8628, 50.1982), (16.8122, 50.191), (16.706, 50.0966), (16.6336, 50.1113),
    (16.5611, 50.1639), (16.5483, 50.2298), (16.4313, 50.3247), (16.3832, 50.3288),
    (16.3607, 50.3796), (16.2786, 50.3674), (16.2105, 50.4112), (16.205, 50.4487),
    (16.3115, 50.5061), (16.3604, 50.5012), (16.4449, 50.5796), (16.3431, 50.6615),
    (16.2348, 50.6716), (16.1842, 50.6272), (16.1037, 50.6634), (16.0248, 50.5986),
    (15.9864, 50.6135), (16.0218, 50.6302), (15.9909, 50.6834), (15.861, 50.6745),
    (15.8162, 50.7553), (15.7057, 50.7373), (15.4395, 50.8091), (15.3748, 50.7776),
    (15.3673, 50.838), (15.2771, 50.891), (15.2741, 50.9795), (15.1799, 50.983),
    (15.1718, 51.02), (15.129, 50.9901), (15.061, 51.0229), (14.9854, 51.0108),
    (14.9682, 50.99), (15.0217, 50.9671), (14.9895, 50.9216), (15.0019, 50.8688),
    (14.8296, 50.8728), (14.7966, 50.821), (14.7223, 50.8221), (14.6189, 50.8578),
    (14.6502, 50.9315), (14.5644, 50.9186), (14.5991, 50.9872), (14.4986, 51.0221),
    (14.5084, 51.0433), (14.4086, 51.0188), (14.3156, 51.0557), (14.2739, 51.0398),
    (14.2587, 50.9875), (14.3235, 50.9854), (14.3114, 50.954), (14.397, 50.9363),
    (14.388, 50.8992), (14.2674, 50.8953), (14.0785, 50.8125), (13.9008, 50.7934),
    (13.8988, 50.7451), (13.8549, 50.727), (13.5519, 50.7137), (13.5252, 50.7044),
    (13.5243, 50.639), (13.4649, 50.6018), (13.3711, 50.6508), (13.3232, 50.5811),
    (13.2484, 50.5921), (13.1953, 50.5032), (13.0317, 50.5098), (13.0199, 50.4466),
    (12.9481, 50.4043), (12.819, 50.4603), (12.8105, 50.4309), (12.7345, 50.4323),
    (12.7071, 50.3971), (12.512, 50.3973), (12.4895, 50.3498), (12.3984, 50.3214),
    (12.3592, 50.2421), (12.3313, 50.2424), (12.3344, 50.1716), (12.2894, 50.1769),
    (12.2939, 50.221), (12.2395, 50.2462), (12.2659, 50.2502), (12.2538, 50.271),
    (12.2013, 50.2728), (12.1846, 50.3222), (12.1047, 50.3217), (12.1401, 50.2778),
    (12.0906, 50.2524), (12.1972, 50.199), (12.1996, 50.1108), (12.2754, 50.0765),
    (12.261, 50.0584), (12.4672, 49.9928), (12.4996, 49.972), (12.4749, 49.9385),
    (12.5477, 49.9205), (12.4731, 49.8337), (12.4726, 49.7861), (12.4006, 49.7538),
    (12.4425, 49.7038), (12.522, 49.6864), (12.5281, 49.6181), (12.5607, 49.6196),
    (12.5885, 49.5385), (12.6442, 49.523), (12.6556, 49.4348), (12.7577, 49.3948),
    (12.7858, 49.3455), (12.9453, 49.3438), (13.0291, 49.3043), (13.034, 49.2639),
    (13.1709, 49.1736), (13.1828, 49.1345), (13.2892, 49.1186), (13.3974, 49.0507),
    (13.4262, 48.9725), (13.4978, 48.9413), (13.5071, 48.9691), (13.5801, 48.9707),
    (13.6714, 48.8801), (13.7379, 48.886), (13.8132, 48.774), (14.0601, 48.6733),
    (14.0106, 48.6397), (14.067, 48.5949), (14.3332, 48.5518), (14.4314, 48.5891),
    (14.4699, 48.6485), (14.5035, 48.6173), (14.6105, 48.6281), (14.6635, 48.582),
    (14.7061, 48.585), (14.727, 48.6871), (14.8081, 48.7339), (14.8087, 48.7788),
    (14.9795, 48.7723), (14.9533, 48.7898), (14.9929, 48.9037), (14.9762, 48.971),
    (15.0205, 49.0205), (15.1563, 48.9933), (15.1602, 48.9417), (15.2616, 48.9536),
    (15.2789, 48.9947), (15.4685, 48.9518), (15.6897, 48.8557), (15.8415, 48.8771),
    (16.1027, 48.7454), (16.378, 48.7285), (16.4604, 48.809), (16.5408, 48.8143),
    (16.6637, 48.781), (16.6826, 48.7278), (16.902, 48.718), (16.9402, 48.6165),
    (17.0433, 48.7643), (17.2002, 48.8776), (17.3613, 48.8135), (17.4532, 48.8467),
    (17.5285, 48.8122), (17.7033, 48.86), (17.7813, 48.9253), (17.8853, 48.9277),
    (17.9243, 49.02), (18.0571, 49.0285), (18.0955, 49.0592), (18.147, 49.2479),
    (18.184, 49.287), (18.3789, 49.3305), (18.4156, 49.3675), (18.4037, 49.3967),
    (18.4757, 49.4085), (18.5529, 49.5031), (18.7545, 49.4884), (18.8509, 49.5171),
    (18.8069, 49.6768), (18.6252, 49.7224), (18.5689, 49.8292), (18.6057, 49.8616),
    (18.5696, 49.8734), (18.5729, 49.9216), (18.5237, 49.8995), (18.333, 49.9494),
    (18.35, 49.9296), (18.3179, 49.9157), (18.2066, 49.9979), (18.117, 49.9942),
    (18.0336, 50.066), (18.0041, 50.039), (18.0444, 50.0366), (18.0455, 50.0051),
    (18.0046, 50.0184), (17.9186, 49.978), (17.7774, 50.0203), (17.7309, 50.0972),
    (17.6503, 50.1108), (17.5927, 50.16), (17.7585, 50.2066), (17.765, 50.2364),
    (17.725, 50.2568), (17.7521, 50.2995), (17.713, 50.3226), (17.6121, 50.266),
    (17.3503, 50.2638), (17.3487, 50.3284), (17.2821, 50.319), (17.2033, 50.3864),
    (16.9079, 50.4495), (16.8603, 50.4078), (16.911, 50.389), (16.9461, 50.3154),
    (17.0026, 50.3021), (17.0283, 50.23), (16.9985, 50.2159), (16.9759, 50.2448),
    (16.8628, 50.1982),
)

def mercator_pixel(lat, lon, zoom, tile_size):
    world_size = tile_size * (2**zoom)
    x = (lon + 180.0) / 360.0 * world_size
    clamped_lat = max(-85.0511, min(85.0511, lat))
    lat_rad = math.radians(clamped_lat)
    y = (0.5 - math.log(math.tan(math.pi / 4 + lat_rad / 2)) / (2 * math.pi)) * world_size
    return x, y

def tile_bounds(border, zoom, tile_size):
    xs, ys = [], []
    for lon, lat in border:
        x, y = mercator_pixel(lat, lon, zoom, tile_size)
        xs.append(x / tile_size)
        ys.append(y / tile_size)
    return int(math.floor(min(xs))), int(math.floor(min(ys))), int(math.floor(max(xs))), int(math.floor(max(ys)))

req = urllib.request.Request(RAINVIEWER_INDEX_URL, headers={"User-Agent": "DRATEK-eInk/1.0"})
with urllib.request.urlopen(req) as resp:
    index = json.loads(resp.read().decode("utf-8"))

host = index["host"]
path = index["radar"]["past"][-1]["path"]

x_min, y_min, x_max, y_max = tile_bounds(CZECH_BORDER, ZOOM, TILE_SIZE)

tiles = {}
for tile_x in range(x_min, x_max + 1):
    for tile_y in range(y_min, y_max + 1):
        url = f"{host}{path}/{TILE_SIZE}/{ZOOM}/{tile_x}/{tile_y}/{COLOR_SCHEME}/{SMOOTH}_{SNOW}.png"
        try:
            t_req = urllib.request.Request(url, headers={"User-Agent": "DRATEK-eInk/1.0"})
            with urllib.request.urlopen(t_req) as t_resp:
                tiles[(tile_x, tile_y)] = Image.open(io.BytesIO(t_resp.read())).convert("RGBA")
        except Exception as e:
            print("Failed tile:", tile_x, tile_y, e)

grid_width = (x_max - x_min + 1) * TILE_SIZE
grid_height = (y_max - y_min + 1) * TILE_SIZE
composite = Image.new("RGBA", (grid_width, grid_height), (0, 0, 0, 0))
for (tx, ty), tile in tiles.items():
    composite.paste(tile, ((tx - x_min) * TILE_SIZE, (ty - y_min) * TILE_SIZE))

origin_x = x_min * TILE_SIZE
origin_y = y_min * TILE_SIZE
polygon = [(px - origin_x, py - origin_y) for px, py in (mercator_pixel(lat, lon, ZOOM, TILE_SIZE) for lon, lat in CZECH_BORDER)]

alpha = composite.getchannel("A")
precipitation_mask = alpha.point(lambda v: 255 if v >= 128 else 0).convert("1")

country_mask = Image.new("L", composite.size, 0)
ImageDraw.Draw(country_mask).polygon(polygon, fill=255)
country_mask = country_mask.convert("1")

output = Image.new("RGB", composite.size, "white")
output.paste(Image.new("RGB", composite.size, (220, 20, 12)), mask=ImageChops.logical_and(country_mask, precipitation_mask))
ImageDraw.Draw(output).polygon(polygon, outline=(0, 0, 0), width=3)

xs = [p[0] for p in polygon]
ys = [p[1] for p in polygon]
crop_box = (max(0, int(min(xs)) - 12), max(0, int(min(ys)) - 12), min(output.width, int(max(xs)) + 12), min(output.height, int(max(ys)) + 12))
cropped = output.crop(crop_box)

# Fit to 400x300 e-ink size
final_img = Image.new("RGB", (400, 300), (255, 255, 255))
scale = min(400 / cropped.width, 300 / cropped.height)
scaled_w = max(1, round(cropped.width * scale))
scaled_h = max(1, round(cropped.height * scale))
scaled = cropped.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
final_img.paste(scaled, ((400 - scaled_w) // 2, (300 - scaled_h) // 2))

# Draw overlay header and footer bars
draw = ImageDraw.Draw(final_img)
draw.rectangle([(0, 0), (400, 28)], fill=(220, 20, 12))
draw.rectangle([(0, 268), (400, 300)], fill=(255, 255, 255), outline=(0, 0, 0), width=1)

final_img.save("test_radar_output.png")
print("Saved test_radar_output.png successfully! Size:", final_img.size)
