import json
import urllib.request
import ssl
from urllib.parse import urlparse, parse_qs

API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3"
YTM_URL = "https://music.youtube.com/youtubei/v1/"

client = {
    "clientName": "ANDROID",
    "clientVersion": "21.03.38",
    "clientId": "3",
    "userAgent": "com.google.android.youtube/21.03.38 (Linux; U; Android 14; en_US; Pixel 8 Pro) gzip"
}

body = {"videoId": "m6Y8xEfyXTs"}
url = f"{YTM_URL}player?key={API_KEY}&prettyPrint=false"
headers = {
    "Content-Type": "application/json",
    "User-Agent": client["userAgent"],
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client["clientId"],
    "X-YouTube-Client-Version": client["clientVersion"],
}
body["context"] = {
    "client": {
        "clientName": client["clientName"],
        "clientVersion": client["clientVersion"],
        "hl": "en-US",
        "gl": "US",
        "utcOffsetMinutes": 0
    }
}

req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
context = ssl._create_unverified_context()
with urllib.request.urlopen(req, context=context) as response:
    res = json.loads(response.read().decode("utf-8"))

formats = res.get("streamingData", {}).get("adaptiveFormats", []) + res.get("streamingData", {}).get("formats", [])
audio = [f for f in formats if f.get("mimeType", "").startswith("audio/")]
stream_url = audio[0].get("url") or audio[1].get("url")

parsed = urlparse(stream_url)
params = parse_qs(parsed.query)

for k, v in sorted(params.items()):
    print(f"{k}: {v[0]}")
