import json
import urllib.request
import ssl

API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3"
YTM_URL = "https://music.youtube.com/youtubei/v1/"

client = {
    "clientName": "ANDROID",
    "clientVersion": "21.03.38",
    "clientId": "3",
    "userAgent": "com.google.android.youtube/21.03.38 (Linux; U; Android 14; en_US; Pixel 8 Pro) gzip"
}

body = {"videoId": "GX9x62kFsVU"}
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

print("Attempting to fetch with ANDROID User-Agent...")
req_stream_android = urllib.request.Request(
    stream_url,
    headers={"User-Agent": client["userAgent"]}
)

try:
    with urllib.request.urlopen(req_stream_android, context=context) as response:
        print("Success with Android UA! HTTP Status:", response.status)
        sample = response.read(100)
        print("Read 100 bytes successfully!")
except Exception as e:
    print("Failed with Android UA:", e)
