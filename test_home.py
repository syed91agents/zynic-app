import urllib.request
import json
import ssl

API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3"
YTM_URL = "https://music.youtube.com/youtubei/v1/"

client = {
    "clientName": "WEB_REMIX",
    "clientVersion": "1.20250520.01.00",
    "clientId": "67",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = f"{YTM_URL}browse?key={API_KEY}&prettyPrint=false"
headers = {
    "Content-Type": "application/json",
    "User-Agent": client["userAgent"],
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": client["clientId"],
    "X-YouTube-Client-Version": client["clientVersion"],
    "X-Origin": "https://music.youtube.com",
    "Referer": "https://music.youtube.com/"
}

body = {
    "browseId": "FEmusic_home",
    "context": {
        "client": {
            "clientName": client["clientName"],
            "clientVersion": client["clientVersion"],
            "hl": "en-US",
            "gl": "US",
            "utcOffsetMinutes": 0
        }
    }
}

req = urllib.request.Request(
    url,
    data=json.dumps(body).encode("utf-8"),
    headers=headers,
    method="POST"
)

context = ssl._create_unverified_context()
try:
    with urllib.request.urlopen(req, context=context) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        contents = res_data['contents']['singleColumnBrowseResultsRenderer']['tabs'][0]['tabRenderer']['content']['sectionListRenderer']['contents']
        for sec in contents:
            if 'musicCarouselShelfRenderer' in sec:
                items = sec['musicCarouselShelfRenderer']['contents']
                item = items[0]
                inner_key = list(item.keys())[0]
                inner_data = item[inner_key]
                print("Item keys:", list(inner_data.keys()))
                # Print some other fields to see where thumbnail is
                for k, v in inner_data.items():
                    if 'thumb' in k.lower() or 'art' in k.lower():
                        print(f"Key {k}:", type(v))
                        print(json.dumps(v, indent=2))
                break
except Exception as e:
    print("Error:", e)
