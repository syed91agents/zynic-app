import urllib.request
import urllib.parse
import json
import os
import re
import hashlib
import time
import ssl
import subprocess

from flask import Flask, request, jsonify, Response, send_from_directory, stream_with_context, abort
from flask_cors import CORS

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

# ---------------------------------------------------------------------------
# Constants / shared state
# ---------------------------------------------------------------------------
API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3"
YTM_URL = "https://music.youtube.com/youtubei/v1/"
STREAM_CACHE = {}

# Live user tracking
# { user_id: { name, avatar_color, current_track, last_seen, first_seen, total_seconds, track_history } }
LIVE_USERS: dict = {}
LIVE_TTL = 60  # seconds before a user is considered offline

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "zynic-admin-2026")

CLIENTS = {
    "WEB_REMIX": {
        "clientName": "WEB_REMIX",
        "clientVersion": "1.20260213.01.00",
        "clientId": "67",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
    },
    "TVHTML5": {
        "clientName": "TVHTML5",
        "clientVersion": "7.20260213.00.00",
        "clientId": "7",
        "userAgent": "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15"
    },
    "TVHTML5_SIMPLY_EMBEDDED_PLAYER": {
        "clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
        "clientVersion": "2.0",
        "clientId": "85",
        "userAgent": "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15"
    },
    "ANDROID_VR": {
        "clientName": "ANDROID_VR",
        "clientVersion": "1.61.48",
        "clientId": "28",
        "userAgent": "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)"
    },
    "ANDROID": {
        "clientName": "ANDROID",
        "clientVersion": "21.03.38",
        "clientId": "3",
        "userAgent": "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip"
    },
    "IOS": {
        "clientName": "IOS",
        "clientVersion": "21.03.1",
        "clientId": "5",
        "userAgent": "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)"
    }
}

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def get_runs_text(obj):
    runs = obj.get("runs", [])
    return "".join([r.get("text", "") for r in runs])


def extract_thumbnail(data):
    if not data:
        return ""
    thumb_data = data.get("thumbnail") or data.get("thumbnailRenderer")
    if not thumb_data:
        return ""
    thumbnails = []
    if "musicThumbnailRenderer" in thumb_data:
        thumbnails = thumb_data["musicThumbnailRenderer"].get("thumbnail", {}).get("thumbnails", [])
    elif "croppedSquareThumbnailRenderer" in thumb_data:
        thumbnails = thumb_data["croppedSquareThumbnailRenderer"].get("thumbnail", {}).get("thumbnails", [])
    elif "thumbnail" in thumb_data:
        thumbnails = thumb_data["thumbnail"].get("thumbnails", [])
    elif isinstance(thumb_data, dict) and "thumbnails" in thumb_data:
        thumbnails = thumb_data.get("thumbnails", [])
    return thumbnails[-1]["url"] if thumbnails else ""


def parse_item_renderer(renderer):
    if not renderer:
        return None

    if "musicTwoRowItemRenderer" in renderer:
        data = renderer["musicTwoRowItemRenderer"]
        title = get_runs_text(data.get("title", {}))
        subtitle = get_runs_text(data.get("subtitle", {}))
        thumb = extract_thumbnail(data)

        nav = data.get("navigationEndpoint", {})
        video_id = nav.get("watchEndpoint", {}).get("videoId")
        playlist_id = (
            nav.get("watchEndpoint", {}).get("playlistId")
            or nav.get("watchPlaylistEndpoint", {}).get("playlistId")
        )
        browse_id = nav.get("browseEndpoint", {}).get("browseId")

        overlay = (
            data.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {})
            or data.get("thumbnailOverlay", {}).get("musicItemThumbnailOverlayRenderer", {})
        )
        play_nav = (
            overlay.get("content", {})
            .get("musicPlayButtonRenderer", {})
            .get("playNavigationEndpoint", {})
        )
        if not video_id:
            video_id = play_nav.get("watchEndpoint", {}).get("videoId")
        if not playlist_id:
            playlist_id = (
                play_nav.get("watchEndpoint", {}).get("playlistId")
                or play_nav.get("watchPlaylistEndpoint", {}).get("playlistId")
            )
        if not browse_id:
            browse_id = play_nav.get("browseEndpoint", {}).get("browseId")

        item_type = "song"
        if video_id:
            item_type = "song"
        elif browse_id and (browse_id.startswith("MPREb_") or browse_id.startswith("FEmusic_")):
            item_type = "album"
        elif browse_id and browse_id.startswith("UC"):
            item_type = "artist"
        elif playlist_id:
            item_type = "playlist"
        elif browse_id and (browse_id.startswith("VL") or browse_id.startswith("PL")):
            item_type = "playlist"

        if not thumb and video_id:
            thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        return {
            "id": video_id or browse_id or playlist_id,
            "title": title,
            "subtitle": subtitle,
            "thumbnail": thumb,
            "type": item_type,
            "videoId": video_id,
            "playlistId": playlist_id,
            "browseId": browse_id
        }

    elif "musicResponsiveListItemRenderer" in renderer:
        data = renderer["musicResponsiveListItemRenderer"]
        flex_cols = data.get("flexColumns", [])
        title = ""
        subtitle = ""
        if len(flex_cols) > 0:
            title = get_runs_text(
                flex_cols[0]
                .get("musicResponsiveListItemFlexColumnRenderer", {})
                .get("text", {})
            )
        if len(flex_cols) > 1:
            subtitle = get_runs_text(
                flex_cols[1]
                .get("musicResponsiveListItemFlexColumnRenderer", {})
                .get("text", {})
            )

        thumb = extract_thumbnail(data)

        playlist_item_data = data.get("playlistItemData", {})
        video_id = playlist_item_data.get("videoId")

        nav = data.get("navigationEndpoint", {})
        if "watchEndpoint" in nav:
            video_id = nav["watchEndpoint"].get("videoId")
        playlist_id = (
            nav.get("watchEndpoint", {}).get("playlistId")
            or nav.get("watchPlaylistEndpoint", {}).get("playlistId")
        )
        browse_id = nav.get("browseEndpoint", {}).get("browseId")

        overlay = (
            data.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {})
            or data.get("thumbnailOverlay", {}).get("musicItemThumbnailOverlayRenderer", {})
        )
        play_nav = (
            overlay.get("content", {})
            .get("musicPlayButtonRenderer", {})
            .get("playNavigationEndpoint", {})
        )
        if not video_id:
            video_id = play_nav.get("watchEndpoint", {}).get("videoId")
        if not playlist_id:
            playlist_id = (
                play_nav.get("watchEndpoint", {}).get("playlistId")
                or play_nav.get("watchPlaylistEndpoint", {}).get("playlistId")
            )
        if not browse_id:
            browse_id = play_nav.get("browseEndpoint", {}).get("browseId")

        item_type = "song"
        if video_id:
            item_type = "song"
        elif browse_id and (browse_id.startswith("MPREb_") or browse_id.startswith("FEmusic_")):
            item_type = "album"
        elif browse_id and browse_id.startswith("UC"):
            item_type = "artist"
        elif playlist_id:
            item_type = "playlist"
        elif browse_id and (browse_id.startswith("VL") or browse_id.startswith("PL")):
            item_type = "playlist"

        if not thumb and video_id:
            thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        return {
            "id": video_id or browse_id or playlist_id,
            "title": title,
            "subtitle": subtitle,
            "thumbnail": thumb,
            "type": item_type,
            "videoId": video_id,
            "playlistId": playlist_id,
            "browseId": browse_id
        }

    return None


def make_ytm_request(endpoint, body, client_key="WEB_REMIX"):
    client = CLIENTS[client_key]
    url = f"{YTM_URL}{endpoint}?key={API_KEY}&prettyPrint=false"

    headers = {
        "Content-Type": "application/json",
        "User-Agent": client["userAgent"],
        "X-Goog-Api-Format-Version": "1",
        "X-YouTube-Client-Name": client["clientId"],
        "X-YouTube-Client-Version": client["clientVersion"],
        "X-Origin": "https://music.youtube.com",
        "Referer": "https://music.youtube.com/"
    }

    if client_key == "WEB_REMIX":
        client_cookie = request.headers.get("X-Ytm-Cookie") or request.headers.get("x-ytm-cookie")
        client_visitor_data = (
            request.headers.get("X-Ytm-Visitor-Data")
            or request.headers.get("x-ytm-visitor-data")
        )
        client_datasync_id = (
            request.headers.get("X-Ytm-Datasync-Id")
            or request.headers.get("x-ytm-datasync-id")
        )
    else:
        client_cookie = None
        client_visitor_data = None
        client_datasync_id = None

    if client_cookie:
        headers["Cookie"] = client_cookie
        sapisid = None
        for item in client_cookie.split(";"):
            item = item.strip()
            if item.startswith("SAPISID="):
                sapisid = item.split("=")[1]
                break
        if sapisid:
            curr_time = int(time.time())
            origin = "https://music.youtube.com"
            msg = f"{curr_time} {sapisid} {origin}"
            sapisid_hash = hashlib.sha1(msg.encode("utf-8")).hexdigest()
            headers["Authorization"] = f"SAPISIDHASH {curr_time}_{sapisid_hash}"

    if client_visitor_data:
        headers["X-Goog-Visitor-Id"] = client_visitor_data

    body["context"] = {
        "client": {
            "clientName": client["clientName"],
            "clientVersion": client["clientVersion"],
            "hl": "en-US",
            "gl": "US",
            "utcOffsetMinutes": 0
        }
    }

    if client_visitor_data:
        body["context"]["client"]["visitorData"] = client_visitor_data

    if client_datasync_id:
        body["context"]["user"] = {
            "onBehalfOfUser": client_datasync_id
        }

    if endpoint == "player" and client_key == "WEB_REMIX":
        body["playbackContext"] = {
            "contentPlaybackContext": {
                "signatureTimestamp": 20522
            }
        }

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=context) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"Error calling YouTube Music API ({endpoint}): {e}")
        return None


def resolve_stream_url(video_id):
    """Use yt-dlp to get the highest-quality stream URL and exact metadata."""
    try:
        res = subprocess.run(
            [
                "python3", "-m", "yt_dlp",
                "--dump-json",
                "--format", "bestaudio[itag=141]/bestaudio[ext=m4a][abr>200]/bestaudio[ext=m4a]/bestaudio",
                "--no-warnings",
                "--quiet",
                "--no-playlist",
                f"https://www.youtube.com/watch?v={video_id}"
            ],
            capture_output=True, text=True, timeout=20
        )
        if res.returncode == 0:
            data = json.loads(res.stdout.strip())
            solved_url = data.get("url")

            content_length = int(data.get("filesize", 0) or data.get("filesize_approx", 0) or 0)
            if content_length == 0:
                content_length = int(data.get("clen", 0) or 0)

            metadata = {
                "title": data.get("title", "Unknown Title"),
                "artist": data.get("uploader", data.get("channel", "Unknown Artist")),
                "lengthSeconds": int(data.get("duration", 0) or 0),
                "bitrate": int(data.get("abr", 128) * 1000),
                "mimeType": f"audio/{data.get('ext', 'mp4')}"
            }

            if solved_url and solved_url.startswith("http"):
                print(f"[yt-dlp] Resolved stream & exact size ({content_length} bytes) successfully")
                return solved_url, content_length, metadata
    except Exception as e:
        print(f"[yt-dlp] Failed: {e}")
    return None, 0, None


def _fetch_chunk(target_url, start, end, cookie_param=None):
    """Fetch a single closed byte-range chunk from the CDN."""
    req = urllib.request.Request(
        target_url,
        headers={
            "User-Agent": "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
            "Referer": "https://music.youtube.com/",
            "Origin": "https://music.youtube.com",
            "Range": f"bytes={start}-{end}"
        }
    )
    if cookie_param:
        req.add_header("Cookie", cookie_param)
    context = ssl._create_unverified_context()
    return urllib.request.urlopen(req, context=context)


def _fetch_lrclib_lyrics(title, artist):
    """Try to fetch lyrics from lrclib.net. Returns (found, synced, lyrics_text)."""
    params = {"track_name": title}
    if artist:
        params["artist_name"] = artist
    search_query = urllib.parse.urlencode(params)
    lrc_url = f"https://lrclib.net/api/get?{search_query}"

    req = urllib.request.Request(lrc_url, headers={"User-Agent": "Zynic / 1.0"})
    try:
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=context) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            synced_lyrics = data.get("syncedLyrics")
            plain_lyrics = data.get("plainLyrics")

            if synced_lyrics:
                return True, True, synced_lyrics
            elif plain_lyrics:
                return True, False, plain_lyrics
    except Exception as e:
        print(f"[LRCLIB] Fetch failed for '{title}' / '{artist}': {e}")
    return False, False, ""

# ---------------------------------------------------------------------------
# Static / index
# ---------------------------------------------------------------------------

@app.route('/')
def serve_index():
    public_dir = os.path.join(os.path.dirname(__file__), 'public')
    return send_from_directory(public_dir, 'index.html')

# ---------------------------------------------------------------------------
# Live user tracking
# ---------------------------------------------------------------------------

@app.route('/api/live/heartbeat', methods=['POST'])
def live_heartbeat():
    body    = request.get_json(silent=True) or {}
    user_id = body.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    now   = time.time()
    track = body.get('current_track')

    if user_id in LIVE_USERS:
        prev = LIVE_USERS[user_id]
        # Accumulate time (cap each interval at 35s to ignore tab-away gaps)
        delta = min(now - prev['last_seen'], 35)
        prev['total_seconds'] = prev.get('total_seconds', 0) + delta
        prev['last_seen']     = now
        prev['name']          = body.get('name', prev['name'])
        prev['avatar_color']  = body.get('avatar_color', prev['avatar_color'])
        prev['current_track'] = track
        # Append to track history if song changed
        history = prev.setdefault('track_history', [])
        if track and (not history or history[-1].get('title') != track.get('title')):
            history.append({**track, 'ts': int(now)})
            if len(history) > 200:
                history.pop(0)
    else:
        LIVE_USERS[user_id] = {
            'name':          body.get('name', 'Anonymous'),
            'avatar_color':  body.get('avatar_color', '#888888'),
            'current_track': track,
            'last_seen':     now,
            'first_seen':    now,
            'total_seconds': 0,
            'track_history': ([{**track, 'ts': int(now)}] if track else [])
        }

    # Prune users not seen in 24 h (keep their stats but mark offline)
    for uid in list(LIVE_USERS.keys()):
        if now - LIVE_USERS[uid]['last_seen'] > 86400:
            del LIVE_USERS[uid]

    return jsonify({"ok": True})


@app.route('/api/live/users', methods=['GET'])
def live_users():
    """Admin-only. Protected by password query param."""
    if request.args.get('key') != ADMIN_PASSWORD:
        return jsonify({"error": "unauthorized"}), 401
    now = time.time()
    result = []
    for uid, u in LIVE_USERS.items():
        result.append({
            "user_id":       uid,
            "name":          u['name'],
            "avatar_color":  u['avatar_color'],
            "current_track": u['current_track'],
            "online":        (now - u['last_seen']) <= LIVE_TTL,
            "last_seen":     int(u['last_seen']),
            "first_seen":    int(u.get('first_seen', u['last_seen'])),
            "total_seconds": int(u.get('total_seconds', 0)),
            "track_history": u.get('track_history', [])[-20:]
        })
    result.sort(key=lambda x: x['last_seen'], reverse=True)
    return jsonify(result)

# ---------------------------------------------------------------------------
# Search / Suggestions
# ---------------------------------------------------------------------------

@app.route('/api/search')
def api_search():
    query = request.args.get('q', '')
    if not query:
        return jsonify({"results": []})

    body = {"query": query, "params": "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D"}
    response = make_ytm_request("search", body, "WEB_REMIX")
    if not response:
        abort(502, description="Bad Gateway calling YouTube Music")

    results = []
    try:
        tabs = response.get("contents", {}).get("tabbedSearchResultsRenderer", {}).get("tabs", [])
        if tabs:
            tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
            sections = tab_content.get("sectionListRenderer", {}).get("contents", [])

            for section in sections:
                if "musicCardShelfRenderer" in section:
                    card = section["musicCardShelfRenderer"]
                    title = get_runs_text(card.get("title", {}))
                    subtitle = get_runs_text(card.get("subtitle", {}))
                    video_id = (
                        card.get("buttons", [{}])[0]
                        .get("buttonRenderer", {})
                        .get("command", {})
                        .get("watchEndpoint", {})
                        .get("videoId")
                    )
                    browse_id = (
                        card.get("title", {})
                        .get("runs", [{}])[0]
                        .get("navigationEndpoint", {})
                        .get("browseEndpoint", {})
                        .get("browseId")
                    )
                    thumb = extract_thumbnail(card)
                    item_type = (
                        "song" if video_id
                        else ("artist" if browse_id and browse_id.startswith("UC") else "album")
                    )
                    results.append({
                        "id": video_id or browse_id,
                        "title": title,
                        "subtitle": subtitle,
                        "thumbnail": thumb,
                        "type": item_type,
                        "isTopResult": True
                    })

                elif "musicShelfRenderer" in section:
                    shelf = section["musicShelfRenderer"]
                    shelf_title = get_runs_text(shelf.get("title", {}))
                    for content in shelf.get("contents", []):
                        item = content.get("musicResponsiveListItemRenderer")
                        if not item:
                            continue

                        title = ""
                        subtitle = ""
                        video_id = None
                        browse_id = None

                        flex_cols = item.get("flexColumns", [])
                        if len(flex_cols) > 0:
                            title = get_runs_text(
                                flex_cols[0]
                                .get("musicResponsiveListItemFlexColumnRenderer", {})
                                .get("text", {})
                            )
                        if len(flex_cols) > 1:
                            subtitle = get_runs_text(
                                flex_cols[1]
                                .get("musicResponsiveListItemFlexColumnRenderer", {})
                                .get("text", {})
                            )

                        playlist_item_data = item.get("playlistItemData", {})
                        video_id = playlist_item_data.get("videoId")

                        nav = item.get("navigationEndpoint", {})
                        if "watchEndpoint" in nav:
                            video_id = nav["watchEndpoint"].get("videoId")
                        elif "browseEndpoint" in nav:
                            browse_id = nav["browseEndpoint"].get("browseId")

                        if not video_id:
                            overlay = item.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {})
                            video_id = (
                                overlay.get("content", {})
                                .get("musicPlayButtonRenderer", {})
                                .get("playNavigationEndpoint", {})
                                .get("watchEndpoint", {})
                                .get("videoId")
                            )

                        thumb = extract_thumbnail(item)

                        item_type = "song"
                        if shelf_title == "Artists":
                            item_type = "artist"
                        elif shelf_title == "Albums":
                            item_type = "album"
                        elif shelf_title == "Playlists":
                            item_type = "playlist"
                        elif video_id:
                            item_type = "song"
                        elif browse_id:
                            item_type = "artist" if browse_id.startswith("UC") else "album"

                        results.append({
                            "id": video_id or browse_id,
                            "title": title,
                            "subtitle": subtitle,
                            "thumbnail": thumb,
                            "type": item_type,
                            "category": shelf_title
                        })
    except Exception as e:
        print(f"Error parsing search results: {e}")

    return jsonify({"results": results})


@app.route('/api/suggestions')
def api_suggestions():
    query = request.args.get('q', '')
    if not query:
        return jsonify({"suggestions": []})

    body = {"input": query}
    response = make_ytm_request("music/get_search_suggestions", body, "WEB_REMIX")
    if not response:
        return jsonify({"suggestions": []})

    suggestions = []
    try:
        contents = response.get("contents", [])
        if contents:
            section = contents[0].get("searchSuggestionsSectionRenderer", {})
            items = section.get("contents", [])
            for item in items:
                s_renderer = item.get("searchSuggestionRenderer", {})
                if s_renderer:
                    runs = s_renderer.get("suggestion", {}).get("runs", [])
                    text = "".join([r.get("text", "") for r in runs])
                    if text:
                        suggestions.append(text)
    except Exception as e:
        print(f"Error parsing suggestions: {e}")

    return jsonify({"suggestions": suggestions})

# ---------------------------------------------------------------------------
# Stream
# ---------------------------------------------------------------------------

@app.route('/api/stream')
def api_stream():
    video_id = request.args.get('id', '')
    if not video_id:
        abort(400, description="Missing id parameter")

    now = time.time()
    if video_id in STREAM_CACHE:
        cached = STREAM_CACHE[video_id]
        if cached.get("expire", 0) > now + 600:
            print(f"[CACHE] Serving cached stream response for {video_id}")
            return jsonify(cached["response"])

    print(f"Requesting stream details for video: {video_id}")

    # --- Primary: yt-dlp resolver ---
    solved_url, content_length, metadata = resolve_stream_url(video_id)
    if solved_url and metadata:
        proxied_url = f"/api/proxy_stream?url={urllib.parse.quote(solved_url)}&len={content_length}"

        expire_val = int(now + 3600)
        expire_match = re.search(r"[?&]expire=(\d+)", solved_url)
        if expire_match:
            expire_val = int(expire_match.group(1))

        resp_dict = {
            "url": proxied_url,
            "title": metadata["title"],
            "artist": metadata["artist"],
            "lengthSeconds": metadata["lengthSeconds"],
            "bitrate": metadata["bitrate"],
            "mimeType": metadata["mimeType"],
            "contentLength": content_length
        }

        STREAM_CACHE[video_id] = {"response": resp_dict, "expire": expire_val}
        return jsonify(resp_dict)

    # --- Fallback: InnerTube client cascade ---
    print(f"[WARNING] Primary yt-dlp resolver failed. Falling back to InnerTube cascade...")
    client_cookie = request.headers.get("X-Ytm-Cookie") or request.headers.get("x-ytm-cookie")
    body = {"videoId": video_id}
    fallback_order = ["ANDROID_VR", "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "TVHTML5", "WEB_REMIX", "ANDROID", "IOS"]
    response = None
    streaming_data = None

    for client_key in fallback_order:
        res = make_ytm_request("player", body, client_key)
        if res and "streamingData" in res:
            play_status = res.get("playabilityStatus", {})
            if play_status.get("status") == "OK":
                response = res
                streaming_data = res["streamingData"]
                break

    if response and streaming_data:
        formats = streaming_data.get("adaptiveFormats", []) + streaming_data.get("formats", [])
        audio_formats = [f for f in formats if f.get("mimeType", "").startswith("audio/")]

        if audio_formats:
            best_format = None
            for itag in [141, 251, 140]:
                best_format = next((f for f in audio_formats if f.get("itag") == itag), None)
                if best_format:
                    break
            if not best_format:
                audio_formats.sort(key=lambda f: int(f.get("bitrate", 0) or 0), reverse=True)
                best_format = audio_formats[0]

            stream_url = best_format.get("url")
            cipher_data = best_format.get("signatureCipher") or best_format.get("cipher")
            solved_url = None

            try:
                solver_script = os.path.join(os.path.dirname(__file__), "solve_helper.js")
                if cipher_data:
                    node_cmd = ["node", solver_script, cipher_data]
                    res = subprocess.run(node_cmd, capture_output=True, text=True, check=True)
                    solved_url = res.stdout.strip()
                elif stream_url:
                    node_cmd = ["node", solver_script, stream_url]
                    res = subprocess.run(node_cmd, capture_output=True, text=True, check=True)
                    solved_url = res.stdout.strip()
            except Exception as e:
                if cipher_data:
                    params = urllib.parse.parse_qs(cipher_data)
                    url_base = params.get("url", [""])[0]
                    sig = params.get("s", [""])[0]
                    sp = params.get("sp", ["sig"])[0]
                    solved_url = f"{url_base}&{sp}={sig}"
                else:
                    solved_url = stream_url

            if solved_url:
                content_length = int(best_format.get("contentLength", 0))
                proxied_url = f"/api/proxy_stream?url={urllib.parse.quote(solved_url)}&len={content_length}"
                if client_cookie:
                    proxied_url += f"&cookie={urllib.parse.quote(client_cookie)}"

                expire_val = int(now + 3600)
                expire_match = re.search(r"[?&]expire=(\d+)", solved_url)
                if expire_match:
                    expire_val = int(expire_match.group(1))

                video_details = response.get("videoDetails", {})
                resp_dict = {
                    "url": proxied_url,
                    "title": video_details.get("title", "Unknown Title"),
                    "artist": video_details.get("author", "Unknown Artist"),
                    "lengthSeconds": int(video_details.get("lengthSeconds", 0)),
                    "bitrate": best_format.get("bitrate"),
                    "mimeType": best_format.get("mimeType"),
                    "contentLength": content_length
                }

                STREAM_CACHE[video_id] = {"response": resp_dict, "expire": expire_val}
                return jsonify(resp_dict)

    abort(500, description="Could not resolve stream URL")

# ---------------------------------------------------------------------------
# Proxy stream (range-request aware)
# ---------------------------------------------------------------------------

@app.route('/api/proxy_stream')
def api_proxy_stream():
    target_url = request.args.get('url', '')
    cookie_param = request.args.get('cookie', '')
    content_length = int(request.args.get('len', '0'))

    if not target_url:
        abort(400, description="Missing url parameter")

    CHUNK_SIZE = 1024 * 1024  # 1 MB per CDN request

    range_header = request.headers.get('Range') or request.headers.get('range')
    req_start = 0
    req_end = content_length - 1 if content_length > 0 else None

    if range_header:
        m = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if m:
            req_start = int(m.group(1))
            if m.group(2):
                req_end = int(m.group(2))

    probe_end = (
        min(req_start + CHUNK_SIZE - 1, req_end)
        if req_end is not None
        else req_start + CHUNK_SIZE - 1
    )
    print(f"[PROXY] Streaming {target_url[:60]}... start={req_start} end={req_end}")

    # We'll store resolved values inside a mutable container so the generator can see them
    state = {}

    def generate():
        try:
            context = ssl._create_unverified_context()
            probe_req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
                    "Referer": "https://music.youtube.com/",
                    "Origin": "https://music.youtube.com",
                    "Range": f"bytes={req_start}-{probe_end}"
                }
            )
            if cookie_param:
                probe_req.add_header("Cookie", cookie_param)

            with urllib.request.urlopen(probe_req, context=context) as probe_resp:
                # Resolve actual total length from Content-Range
                cr = probe_resp.getheader("Content-Range", "")
                nonlocal content_length, req_end
                if cr and "/" in cr:
                    try:
                        total = int(cr.split("/")[1])
                        if req_end is None or req_end >= total:
                            req_end = total - 1
                        if content_length == 0:
                            content_length = total
                    except ValueError:
                        pass

                # Stream first chunk
                try:
                    while True:
                        data = probe_resp.read(65536)
                        if not data:
                            break
                        yield data
                except (ConnectionResetError, BrokenPipeError):
                    return

            # Stream subsequent 1 MB chunks
            if req_end is not None:
                current = req_start + CHUNK_SIZE
                while current <= req_end:
                    chunk_end = min(current + CHUNK_SIZE - 1, req_end)
                    try:
                        with _fetch_chunk(target_url, current, chunk_end, cookie_param) as resp:
                            try:
                                while True:
                                    data = resp.read(65536)
                                    if not data:
                                        break
                                    yield data
                            except (ConnectionResetError, BrokenPipeError):
                                return
                    except Exception as e:
                        print(f"[PROXY] Chunk fetch failed at {current}-{chunk_end}: {e}")
                        return
                    current += CHUNK_SIZE

        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            print(f"[PROXY] Error in proxy stream: {e}")

    # We need content-type and the resolved length before streaming; do a quick head probe
    try:
        context = ssl._create_unverified_context()
        head_req = urllib.request.Request(
            target_url,
            headers={
                "User-Agent": "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
                "Referer": "https://music.youtube.com/",
                "Origin": "https://music.youtube.com",
                "Range": f"bytes={req_start}-{probe_end}"
            }
        )
        if cookie_param:
            head_req.add_header("Cookie", cookie_param)
        with urllib.request.urlopen(head_req, context=context) as head_resp:
            content_type = head_resp.getheader("Content-Type", "audio/mp4")
            cr = head_resp.getheader("Content-Range", "")
            if cr and "/" in cr:
                try:
                    total = int(cr.split("/")[1])
                    if req_end is None or req_end >= total:
                        req_end = total - 1
                    if content_length == 0:
                        content_length = total
                except ValueError:
                    pass
    except Exception:
        content_type = "audio/mp4"

    serve_length = (req_end - req_start + 1) if req_end is not None else None

    status_code = 206 if (range_header and req_end is not None) else 200

    headers = {
        "Content-Type": content_type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache"
    }
    if status_code == 206 and req_end is not None:
        headers["Content-Range"] = f"bytes {req_start}-{req_end}/{content_length or '*'}"
    if serve_length is not None:
        headers["Content-Length"] = str(serve_length)

    return Response(
        stream_with_context(generate()),
        status=status_code,
        headers=headers,
        direct_passthrough=True
    )

# ---------------------------------------------------------------------------
# Lyrics
# ---------------------------------------------------------------------------

@app.route('/api/lyrics')
def api_lyrics():
    title = request.args.get('title', '')
    artist = request.args.get('artist', '')

    if not title:
        return jsonify({"synced": False, "lyrics": "Search for a song first."})

    # 1. Try full artist list
    found, synced, lyrics = _fetch_lrclib_lyrics(title, artist)
    if found:
        return jsonify({"synced": synced, "lyrics": lyrics})

    # 2. Try primary artist only
    primary_artist = artist
    for sep in [",", "&", "feat.", "ft.", "and"]:
        if sep in primary_artist:
            primary_artist = primary_artist.split(sep)[0].strip()

    if primary_artist != artist:
        print(f"[LYRICS FALLBACK] Trying primary artist: '{primary_artist}'")
        found, synced, lyrics = _fetch_lrclib_lyrics(title, primary_artist)
        if found:
            return jsonify({"synced": synced, "lyrics": lyrics})

    # 3. Title only
    print(f"[LYRICS FALLBACK] Trying title search only: '{title}'")
    found, synced, lyrics = _fetch_lrclib_lyrics(title, "")
    if found:
        return jsonify({"synced": synced, "lyrics": lyrics})

    return jsonify({"synced": False, "lyrics": "Lyrics not found for this song."})

# ---------------------------------------------------------------------------
# Proxy image
# ---------------------------------------------------------------------------

@app.route('/api/proxy_image')
def api_proxy_image():
    image_url = request.args.get('url', '')
    if not image_url:
        abort(400, description="Missing url parameter")
    try:
        req = urllib.request.Request(
            image_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
            }
        )
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=context) as resp:
            content = resp.read()
            content_type = resp.getheader("Content-Type", "image/jpeg")
            return Response(
                content,
                status=200,
                headers={
                    "Content-Type": content_type,
                    "Content-Length": str(len(content)),
                    "Cache-Control": "public, max-age=86400"
                }
            )
    except Exception as e:
        print(f"[IMAGE PROXY] Failed to proxy image: {e}")
        abort(502, description=f"Failed to proxy image: {e}")

# ---------------------------------------------------------------------------
# Home / Explore / Charts / Browse
# ---------------------------------------------------------------------------

@app.route('/api/home')
def api_home():
    body = {"browseId": "FEmusic_home"}
    response = make_ytm_request("browse", body, "WEB_REMIX")
    if not response:
        abort(502, description="Failed to load home feed from YouTube")

    shelves = []
    try:
        tabs = (
            response.get("contents", {})
            .get("singleColumnBrowseResultsRenderer", {})
            .get("tabs", [])
        )
        if tabs:
            tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
            sections = tab_content.get("sectionListRenderer", {}).get("contents", [])

            for section in sections:
                if "musicCarouselShelfRenderer" in section:
                    carousel = section["musicCarouselShelfRenderer"]
                    header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                    title = get_runs_text(header.get("title", {}))

                    items = []
                    for content in carousel.get("contents", []):
                        item = parse_item_renderer(content)
                        if item:
                            items.append(item)

                    if items:
                        shelves.append({"title": title, "items": items})
    except Exception as e:
        print(f"Error parsing home feed: {e}")

    return jsonify({"shelves": shelves})


@app.route('/api/explore')
def api_explore():
    body = {"browseId": "FEmusic_explore"}
    response = make_ytm_request("browse", body, "WEB_REMIX")
    if not response:
        abort(502, description="Failed to load explore feed from YouTube")

    new_releases = []
    moods_genres = []
    try:
        tabs = (
            response.get("contents", {})
            .get("singleColumnBrowseResultsRenderer", {})
            .get("tabs", [])
        )
        if tabs:
            tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
            sections = tab_content.get("sectionListRenderer", {}).get("contents", [])

            for section in sections:
                if "musicCarouselShelfRenderer" in section:
                    carousel = section["musicCarouselShelfRenderer"]
                    header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                    title = get_runs_text(header.get("title", {}))

                    if "new releases" in title.lower() or "album" in title.lower():
                        for content in carousel.get("contents", []):
                            item = parse_item_renderer(content)
                            if item:
                                new_releases.append(item)

                    elif "mood" in title.lower() or "genre" in title.lower():
                        for content in carousel.get("contents", []):
                            btn = content.get("musicNavigationButtonRenderer", {})
                            if btn:
                                btn_title = get_runs_text(btn.get("buttonText", {}))
                                browse_id = (
                                    btn.get("clickCommand", {})
                                    .get("browseEndpoint", {})
                                    .get("browseId")
                                )
                                moods_genres.append({
                                    "title": btn_title,
                                    "id": browse_id,
                                    "type": "playlist"
                                })
    except Exception as e:
        print(f"Error parsing explore feed: {e}")

    return jsonify({"newReleases": new_releases, "moodsAndGenres": moods_genres})


@app.route('/api/charts')
def api_charts():
    body = {"browseId": "FEmusic_charts"}
    response = make_ytm_request("browse", body, "WEB_REMIX")
    if not response:
        abort(502, description="Failed to load charts from YouTube")

    charts = []
    try:
        tabs = (
            response.get("contents", {})
            .get("singleColumnBrowseResultsRenderer", {})
            .get("tabs", [])
        )
        if tabs:
            tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
            sections = tab_content.get("sectionListRenderer", {}).get("contents", [])

            for section in sections:
                if "musicCarouselShelfRenderer" in section:
                    carousel = section["musicCarouselShelfRenderer"]
                    header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                    title = get_runs_text(header.get("title", {}))

                    items = []
                    for content in carousel.get("contents", []):
                        item = parse_item_renderer(content)
                        if item:
                            items.append(item)

                    if items:
                        charts.append({"title": title, "items": items})
    except Exception as e:
        print(f"Error parsing charts feed: {e}")

    return jsonify({"charts": charts})


@app.route('/api/browse')
def api_browse():
    browse_id = request.args.get('id', '')
    if not browse_id:
        abort(400, description="Missing id parameter")

    body = {"browseId": browse_id}
    response = make_ytm_request("browse", body, "WEB_REMIX")
    if not response:
        abort(502, description="Failed to load details from YouTube")

    details = {}
    try:
        header = response.get("header", {})
        details["id"] = browse_id

        if "musicHeaderRenderer" in header:
            details["title"] = get_runs_text(header["musicHeaderRenderer"].get("title", {}))
            details["subtitle"] = get_runs_text(header["musicHeaderRenderer"].get("subtitle", {}))
        elif "musicDetailHeaderRenderer" in header:
            details["title"] = get_runs_text(header["musicDetailHeaderRenderer"].get("title", {}))
            details["subtitle"] = get_runs_text(header["musicDetailHeaderRenderer"].get("subtitle", {}))
            details["description"] = get_runs_text(header["musicDetailHeaderRenderer"].get("description", {}))
            thumbnails = (
                header["musicDetailHeaderRenderer"]
                .get("thumbnail", {})
                .get("croppedSquareThumbnailRenderer", {})
                .get("thumbnail", {})
                .get("thumbnails", [])
            )
            details["thumbnail"] = thumbnails[-1]["url"] if thumbnails else ""
        elif "musicImmersiveHeaderRenderer" in header:
            details["title"] = get_runs_text(header["musicImmersiveHeaderRenderer"].get("title", {}))
            thumbnails = (
                header["musicImmersiveHeaderRenderer"]
                .get("thumbnail", {})
                .get("musicThumbnailRenderer", {})
                .get("thumbnail", {})
                .get("thumbnails", [])
            )
            details["thumbnail"] = thumbnails[-1]["url"] if thumbnails else ""

        contents = response.get("contents", {})
        all_sections = []

        tabs = []
        if "singleColumnBrowseResultsRenderer" in contents:
            tabs = contents["singleColumnBrowseResultsRenderer"].get("tabs", [])
        elif "twoColumnBrowseResultsRenderer" in contents:
            tabs = contents["twoColumnBrowseResultsRenderer"].get("tabs", [])

        for tab in tabs:
            tab_sections = (
                tab.get("tabRenderer", {})
                .get("content", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
            all_sections.extend(tab_sections)

        if "twoColumnBrowseResultsRenderer" in contents:
            sec_contents = contents["twoColumnBrowseResultsRenderer"].get("secondaryContents", {})
            if "sectionListRenderer" in sec_contents:
                all_sections.extend(sec_contents["sectionListRenderer"].get("contents", []))
            elif "musicPlaylistShelfRenderer" in sec_contents:
                all_sections.append({"musicPlaylistShelfRenderer": sec_contents["musicPlaylistShelfRenderer"]})
            elif "musicShelfRenderer" in sec_contents:
                all_sections.append({"musicShelfRenderer": sec_contents["musicShelfRenderer"]})

        tracks = []
        sections_data = []

        for section in all_sections:
            if "musicResponsiveHeaderRenderer" in section:
                hdr = section["musicResponsiveHeaderRenderer"]
                if not details.get("title"):
                    details["title"] = get_runs_text(hdr.get("title", {}))
                if not details.get("subtitle"):
                    sub_text = get_runs_text(hdr.get("subtitle", {}))
                    sec_sub_text = get_runs_text(hdr.get("secondSubtitle", {}))
                    details["subtitle"] = (
                        f"{sub_text} • {sec_sub_text}"
                        if sub_text and sec_sub_text
                        else (sub_text or sec_sub_text)
                    )
                if not details.get("thumbnail"):
                    details["thumbnail"] = extract_thumbnail(hdr)

            elif "musicPlaylistShelfRenderer" in section:
                shelf = section["musicPlaylistShelfRenderer"]
                for content in shelf.get("contents", []):
                    track = parse_item_renderer(content)
                    if track:
                        tracks.append(track)

            elif "musicShelfRenderer" in section:
                shelf = section["musicShelfRenderer"]
                shelf_title = get_runs_text(shelf.get("title", {}))
                shelf_tracks = []
                for content in shelf.get("contents", []):
                    track = parse_item_renderer(content)
                    if track:
                        if browse_id.startswith("UC"):
                            shelf_tracks.append(track)
                        else:
                            tracks.append(track)
                if shelf_tracks:
                    sections_data.append({"title": shelf_title or "Songs", "items": shelf_tracks})

            elif "musicCarouselShelfRenderer" in section:
                carousel = section["musicCarouselShelfRenderer"]
                title = get_runs_text(
                    carousel.get("header", {})
                    .get("musicCarouselShelfBasicHeaderRenderer", {})
                    .get("title", {})
                )
                items = []
                for content in carousel.get("contents", []):
                    item = parse_item_renderer(content)
                    if item:
                        items.append(item)
                if items:
                    sections_data.append({"title": title, "items": items})

            elif "gridRenderer" in section:
                grid = section["gridRenderer"]
                title = get_runs_text(
                    grid.get("header", {})
                    .get("gridHeaderRenderer", {})
                    .get("title", {})
                )
                items = []
                for content in grid.get("items", []):
                    item = parse_item_renderer(content)
                    if item:
                        items.append(item)
                if items:
                    sections_data.append({"title": title, "items": items})

        if not details.get("title"):
            microformat = response.get("microformat", {}).get("microformatDataRenderer", {})
            if microformat:
                details["title"] = microformat.get("title", "")
                details["description"] = microformat.get("description", "")
                thumbnails = microformat.get("thumbnail", {}).get("thumbnails", [])
                details["thumbnail"] = thumbnails[-1]["url"] if thumbnails else ""

        if tracks:
            details["tracks"] = tracks
        if sections_data:
            details["sections"] = sections_data

        if browse_id:
            details["linerNotes"] = (
                "Recorded at Zynic Sonic Laboratories (May 2026).\n"
                "Tracking: 2-inch 24-Track Analog Tape Machine (Studer A800) into a SSL 4000E Console.\n"
                "Outboards & Mics: Teletronix LA-2A, Pultec EQP-1A, Neumann U87, vintage AKG C12.\n"
                "Instruments: Moog Model D, Mellotron M400, Oberheim OB-Xa, custom acoustic plates.\n\n"
                "\"We bypassed all digital limiters and brickwalls during master tracking. This preserve the absolute "
                "physical transients, keeping the original air, dynamic range, and warm analog saturation fully intact.\""
            )
            details["hiddenTracks"] = [
                {
                    "id": "JzAP1D9BPEk",
                    "title": "Ambient Hidden Frequency (Unreleased Cut)",
                    "artist": "Mystery Archive",
                    "thumbnail": "https://i.ytimg.com/vi/JzAP1D9BPEk/hqdefault.jpg",
                    "duration": "4:05"
                }
            ]
            details["commentaries"] = {
                "0": "Host: We opened the record with deep sub-bass frequencies to immediately tune your listening room acoustics.",
                "1": "Host: This synth lead was double-tracked through an overdriven tape pre-amp at 4:00 AM. It has a beautiful vintage crunch.",
                "2": "Host: We recorded the acoustic piano live in the stairwell to capture natural chamber reverb. Zero digital plates were used."
            }

    except Exception as e:
        print(f"Error parsing browse results for {browse_id}: {e}")

    return jsonify(details)

# ---------------------------------------------------------------------------
# Static file fallback (SPA support)
# ---------------------------------------------------------------------------

@app.route('/<path:path>')
def serve_static(path):
    public_dir = os.path.join(os.path.dirname(__file__), 'public')
    full_path = os.path.join(public_dir, path)
    if os.path.exists(full_path) and not os.path.isdir(full_path):
        return send_from_directory(public_dir, path)
    # SPA fallback
    return send_from_directory(public_dir, 'index.html')

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@app.route('/api/health')
def api_health():
    return jsonify({"status": "ok", "live_users": len(LIVE_USERS)})


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------

ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zynic Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0a0a0f;--surface:#12121a;--card:#1a1a26;--border:rgba(255,255,255,.08);
        --accent:#a855f7;--green:#4ade80;--red:#f87171;--text:#e2e8f0;--muted:#64748b}
  body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;min-height:100vh}
  /* Login */
  #login{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;
    padding:40px;width:340px;text-align:center}
  .login-card h1{font-size:1.6rem;font-weight:800;margin-bottom:6px;
    background:linear-gradient(135deg,#a855f7,#6366f1);-webkit-background-clip:text;
    -webkit-text-fill-color:transparent}
  .login-card p{color:var(--muted);font-size:.85rem;margin-bottom:24px}
  .login-card input{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);
    border:1px solid var(--border);border-radius:12px;color:var(--text);
    font-size:1rem;outline:none;margin-bottom:12px}
  .login-card input:focus{border-color:var(--accent)}
  .login-card button{width:100%;padding:12px;background:var(--accent);border:none;
    border-radius:12px;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}
  .login-card button:hover{opacity:.85}
  .login-error{color:var(--red);font-size:.82rem;margin-top:8px;display:none}
  /* Dashboard */
  #dashboard{display:none;padding:24px;max-width:1200px;margin:0 auto}
  header{display:flex;align-items:center;justify-content:space-between;
    margin-bottom:28px;flex-wrap:wrap;gap:12px}
  header h1{font-size:1.5rem;font-weight:800;
    background:linear-gradient(135deg,#a855f7,#6366f1);-webkit-background-clip:text;
    -webkit-text-fill-color:transparent}
  .header-meta{display:flex;align-items:center;gap:12px}
  .refresh-btn{padding:8px 18px;background:rgba(168,85,247,.15);border:1px solid var(--accent);
    border-radius:10px;color:var(--accent);font-weight:700;cursor:pointer;font-size:.85rem}
  .refresh-btn:hover{background:rgba(168,85,247,.3)}
  .logout-btn{padding:8px 18px;background:rgba(248,113,113,.1);border:1px solid var(--red);
    border-radius:10px;color:var(--red);font-weight:700;cursor:pointer;font-size:.85rem}
  /* Stats row */
  .stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px}
  .stat-card{background:var(--card);border:1px solid var(--border);border-radius:14px;
    padding:18px 20px;text-align:center}
  .stat-num{font-size:2rem;font-weight:800;display:block;
    background:linear-gradient(135deg,#a855f7,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .stat-label{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
  /* Table */
  .section-title{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;
    color:var(--muted);margin-bottom:12px}
  .table-wrap{background:var(--card);border:1px solid var(--border);border-radius:16px;
    overflow:hidden;margin-bottom:32px}
  table{width:100%;border-collapse:collapse}
  th{background:rgba(255,255,255,.04);padding:12px 16px;text-align:left;
    font-size:.75rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
  td{padding:12px 16px;border-top:1px solid var(--border);font-size:.88rem;vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.02)}
  .status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
  .online{background:var(--green);box-shadow:0 0 6px var(--green)}
  .offline{background:var(--muted)}
  .avatar{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;
    justify-content:center;font-size:.75rem;font-weight:800;color:#fff;flex-shrink:0;vertical-align:middle;margin-right:8px}
  .track-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.05);
    border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:.78rem}
  .track-chip i{color:var(--accent);font-size:.7rem}
  .history-toggle{background:none;border:none;color:var(--accent);cursor:pointer;
    font-size:.78rem;text-decoration:underline}
  .history-row td{padding:6px 16px 12px;background:rgba(0,0,0,.2)}
  .history-list{display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto}
  .history-entry{font-size:.78rem;color:var(--muted);display:flex;align-items:center;gap:8px}
  .history-entry span{color:var(--text)}
  .no-data{text-align:center;padding:40px;color:var(--muted)}
  @media(max-width:600px){
    th:nth-child(4),th:nth-child(5),td:nth-child(4),td:nth-child(5){display:none}
    .stats-row{grid-template-columns:repeat(2,1fr)}
  }
</style>
</head>
<body>

<!-- Login gate -->
<div id="login">
  <div class="login-card">
    <h1>⚡ Zynic Admin</h1>
    <p>Enter admin password to access the dashboard</p>
    <input type="password" id="pwd-input" placeholder="Password" autocomplete="current-password">
    <button onclick="doLogin()">Sign In</button>
    <div class="login-error" id="login-error">Incorrect password</div>
  </div>
</div>

<!-- Dashboard -->
<div id="dashboard">
  <header>
    <h1>⚡ Zynic Admin Dashboard</h1>
    <div class="header-meta">
      <span id="last-refresh" style="font-size:.78rem;color:var(--muted)"></span>
      <button class="refresh-btn" onclick="loadData()">↻ Refresh</button>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  </header>

  <div class="stats-row">
    <div class="stat-card"><span class="stat-num" id="stat-total">0</span><span class="stat-label">Total Users</span></div>
    <div class="stat-card"><span class="stat-num" id="stat-online">0</span><span class="stat-label">Online Now</span></div>
    <div class="stat-card"><span class="stat-num" id="stat-hours">0</span><span class="stat-label">Total Hours Spent</span></div>
    <div class="stat-card"><span class="stat-num" id="stat-tracks">0</span><span class="stat-label">Tracks Played</span></div>
  </div>

  <div class="section-title">All Users</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Status</th>
          <th>Now Playing</th>
          <th>Time Spent</th>
          <th>Tracks</th>
          <th>First Seen</th>
          <th>History</th>
        </tr>
      </thead>
      <tbody id="users-tbody"></tbody>
    </table>
  </div>
</div>

<script>
let adminKey = '';

function doLogin() {
  const pwd = document.getElementById('pwd-input').value.trim();
  if (!pwd) return;
  fetch('/api/live/users?key=' + encodeURIComponent(pwd))
    .then(r => {
      if (r.status === 401) { document.getElementById('login-error').style.display='block'; return null; }
      return r.json();
    })
    .then(data => {
      if (!data) return;
      adminKey = pwd;
      document.getElementById('login').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      renderData(data);
      setInterval(loadData, 20000);
    })
    .catch(() => { document.getElementById('login-error').style.display='block'; });
}

document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });

function logout() {
  adminKey = '';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
}

function loadData() {
  fetch('/api/live/users?key=' + encodeURIComponent(adminKey))
    .then(r => r.json())
    .then(renderData)
    .catch(console.error);
}

function fmtTime(secs) {
  if (secs < 60) return secs + 's';
  if (secs < 3600) return Math.floor(secs/60) + 'm ' + (secs%60) + 's';
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  return h + 'h ' + m + 'm';
}

function fmtDate(ts) {
  return new Date(ts*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
}

function renderData(users) {
  document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();

  const online  = users.filter(u => u.online).length;
  const totalH  = Math.round(users.reduce((a,u) => a + (u.total_seconds||0), 0) / 3600 * 10) / 10;
  const tracks  = users.reduce((a,u) => a + (u.track_history||[]).length, 0);

  document.getElementById('stat-total').textContent  = users.length;
  document.getElementById('stat-online').textContent = online;
  document.getElementById('stat-hours').textContent  = totalH;
  document.getElementById('stat-tracks').textContent = tracks;

  const tbody = document.getElementById('users-tbody');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No users yet</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, idx) => {
    const dotCls  = u.online ? 'online' : 'offline';
    const statusTxt = u.online ? 'Online' : 'Offline';
    const trackHtml = u.current_track
      ? `<div class="track-chip"><i class="fa fa-music"></i>${u.current_track.title}${u.current_track.artist ? ' — ' + u.current_track.artist : ''}</div>`
      : '<span style="color:var(--muted);font-size:.8rem">—</span>';
    const histCount = (u.track_history||[]).length;
    return `<tr>
      <td>
        <div class="avatar" style="background:${u.avatar_color||'#6366f1'}">${initials(u.name)}</div>
        <span style="font-weight:600">${u.name}</span>
        <div style="font-size:.7rem;color:var(--muted);margin-top:2px;margin-left:40px">${u.user_id}</div>
      </td>
      <td><span class="status-dot ${dotCls}"></span>${statusTxt}</td>
      <td>${trackHtml}</td>
      <td style="font-weight:700;color:#a855f7">${fmtTime(u.total_seconds||0)}</td>
      <td>${histCount}</td>
      <td style="color:var(--muted);font-size:.8rem">${fmtDate(u.first_seen)}</td>
      <td>${histCount > 0 ? `<button class="history-toggle" onclick="toggleHistory(${idx})">▶ Show</button>` : '—'}</td>
    </tr>
    <tr class="history-row" id="hist-${idx}" style="display:none">
      <td colspan="7">
        <div class="history-list">
          ${(u.track_history||[]).slice().reverse().map(t =>
            `<div class="history-entry"><span style="color:var(--muted);font-size:.7rem">${fmtDate(t.ts)}</span><span>${t.title}${t.artist?' — '+t.artist:''}</span></div>`
          ).join('')}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function toggleHistory(idx) {
  const row = document.getElementById('hist-'+idx);
  const isHidden = row.style.display === 'none';
  row.style.display = isHidden ? 'table-row' : 'none';
  const btn = row.previousElementSibling.querySelector('.history-toggle');
  if (btn) btn.textContent = isHidden ? '▼ Hide' : '▶ Show';
}
</script>
</body>
</html>
"""


@app.route('/admin')
def admin_dashboard():
    return Response(ADMIN_HTML, content_type='text/html')


if __name__ == '__main__':
    os.makedirs(os.path.join(os.path.dirname(__file__), 'public'), exist_ok=True)
    port = int(os.environ.get('PORT', 8000))
    print(f"Zynic Flask API Gateway starting on port {port}")
    print(f"Access it at: http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
