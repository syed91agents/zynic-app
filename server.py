import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import re
import hashlib
import time
import ssl
import subprocess

PORT = 8000
API_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX3"
YTM_URL = "https://music.youtube.com/youtubei/v1/"
STREAM_CACHE = {}

ROOMS_CACHE = {
    "default-ambient": {
        "id": "default-ambient",
        "name": "Ambient Soundscapes 🌌",
        "host": "Zynic Host",
        "type": "democratic",
        "activeTrack": {
            "id": "JzAP1D9BPEk",
            "title": "Deep Space Ambient Music (Lofi & Chill)",
            "artist": "Lofi Chill Out",
            "thumbnail": "https://i.ytimg.com/vi/JzAP1D9BPEk/hqdefault.jpg"
        },
        "progress": 45,
        "listeners": [
            {"name": "Eve User", "avatar": "fa-user-circle"}
        ],
        "chat": [
            {"user": "Zynic Host", "message": "Welcome to Ambient Soundscapes! Feel free to vote or chat.", "timestamp": 1779869600000}
        ],
        "queue": [
            {
                "id": "5qap5aO4i9A",
                "title": "lofi hip hop radio - beats to relax/study to",
                "artist": "ChilledCow",
                "thumbnail": "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
                "votes": 3,
                "votedUsers": []
            },
            {
                "id": "TUT1dY2vN_U",
                "title": "Focus Lofi Chill beats for studying & deep work",
                "artist": "Lofi Study",
                "thumbnail": "https://i.ytimg.com/vi/TUT1dY2vN_U/hqdefault.jpg",
                "votes": 1,
                "votedUsers": []
            }
        ],
        "recording": False,
        "recordedLogs": []
    },
    "cyberpunk-syndicate": {
        "id": "cyberpunk-syndicate",
        "name": "Synthwave Cyber-Synd Syndicate 🕶️",
        "host": "Ghost AI",
        "type": "host-only",
        "activeTrack": {
            "id": "4xDzrJKXOOY",
            "title": "Synthwave Radio - Chill synth / retro electro beats",
            "artist": "Lofi retro",
            "thumbnail": "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg"
        },
        "progress": 110,
        "listeners": [],
        "chat": [],
        "queue": [],
        "recording": False,
        "recordedLogs": []
    }
}

# Client configurations matching Metrolist Android app
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

class YTMRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for ease of debugging/access
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Ytm-Cookie, X-Ytm-Visitor-Data, X-Ytm-Datasync-Id')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return {}

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        body = self._read_json_body()

        if path == '/api/rooms/create':
            self.handle_rooms_create(
                body.get('name', ''),
                body.get('type', 'democratic'),
                body.get('host', 'Anonymous Host')
            )
        elif path == '/api/rooms/action':
            self.handle_rooms_action_json(body)
        else:
            self.send_error(404, 'Not Found')

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/search":
            query = query_params.get("q", [""])[0]
            self.handle_search(query)
        elif path == "/api/suggestions":
            query = query_params.get("q", [""])[0]
            self.handle_suggestions(query)
        elif path == "/api/stream":
            video_id = query_params.get("id", [""])[0]
            self.handle_stream(video_id)
        elif path == "/api/proxy_stream":
            self.handle_proxy_stream()
        elif path == "/api/lyrics":
            title = query_params.get("title", [""])[0]
            artist = query_params.get("artist", [""])[0]
            self.handle_lyrics(title, artist)
        elif path == "/api/proxy_image":
            image_url = query_params.get("url", [""])[0]
            self.handle_proxy_image(image_url)
        elif path == "/api/home":
            self.handle_home()
        elif path == "/api/explore":
            self.handle_explore()
        elif path == "/api/charts":
            self.handle_charts()
        elif path == "/api/browse":
            browse_id = query_params.get("id", [""])[0]
            self.handle_browse(browse_id)
        elif path == "/api/petdex/manifest":
            self.handle_petdex_manifest()
        elif path == "/api/rooms/list":
            self.handle_rooms_list()
        elif path == "/api/rooms/create":
            name = query_params.get("name", [""])[0]
            r_type = query_params.get("type", ["democratic"])[0]
            host = query_params.get("host", ["Anonymous Host"])[0]
            self.handle_rooms_create(name, r_type, host)
        elif path == "/api/rooms/get":
            r_id = query_params.get("room_id", query_params.get("id", [""]))[0]
            self.handle_rooms_get(r_id)
        elif path == "/api/rooms/action":
            r_id = query_params.get("id", [""])[0]
            action = query_params.get("action", [""])[0]
            self.handle_rooms_action(r_id, action, query_params)
        elif path == "/api/discover/mood":
            mood = query_params.get("mood", ["chill"])[0]
            self.handle_discover_mood(mood)
        elif path == "/api/discover/sounds_like":
            track_id = query_params.get("id", [""])[0]
            self.handle_discover_sounds_like(track_id)
        else:
            # Serve static files
            self.serve_static(path)

    def serve_static(self, path):
        # Default to index.html for root path
        if path == "/" or path == "":
            path = "/index.html"
        
        # Guard against path traversal
        path = os.path.normpath(path).lstrip("/")
        if ".." in path:
            self.send_error(400, "Bad Request")
            return

        # Determine file path
        base_dir = os.path.join(os.path.dirname(__file__), "public")
        file_path = os.path.join(base_dir, path)

        if not os.path.exists(file_path) or os.path.isdir(file_path):
            file_path = os.path.join(base_dir, "index.html")
            if not os.path.exists(file_path):
                self.send_error(404, "File Not Found")
                return

        # Determine content type
        content_type = "text/plain"
        if file_path.endswith(".html"):
            content_type = "text/html"
        elif file_path.endswith(".css"):
            content_type = "text/css"
        elif file_path.endswith(".js"):
            content_type = "application/javascript"
        elif file_path.endswith(".png"):
            content_type = "image/png"
        elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
            content_type = "image/jpeg"
        elif file_path.endswith(".svg"):
            content_type = "image/svg+xml"
        elif file_path.endswith(".ico"):
            content_type = "image/x-icon"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Server Error: {str(e)}")

    def make_ytm_request(self, endpoint, body, client_key="WEB_REMIX"):
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
        
        # Extract headers from incoming client request (only for WEB_REMIX)
        if client_key == "WEB_REMIX":
            client_cookie = self.headers.get("X-Ytm-Cookie") or self.headers.get("x-ytm-cookie")
            client_visitor_data = self.headers.get("X-Ytm-Visitor-Data") or self.headers.get("x-ytm-visitor-data")
            client_datasync_id = self.headers.get("X-Ytm-Datasync-Id") or self.headers.get("x-ytm-datasync-id")
        else:
            client_cookie = None
            client_visitor_data = None
            client_datasync_id = None
        
        if client_cookie:
            headers["Cookie"] = client_cookie
            # Parse SAPISID to compute SAPISIDHASH
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

        # Populate context in request body
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
            
        # Include playbackContext with signatureTimestamp for WEB_REMIX player requests
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
            # Bypass SSL checks to avoid any system trust errors
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=context) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            print(f"Error calling YouTube Music API ({endpoint}): {e}")
            return None

    def get_runs_text(self, obj):
        runs = obj.get("runs", [])
        return "".join([r.get("text", "") for r in runs])

    def extract_thumbnail(self, data):
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

    def parse_item_renderer(self, renderer):
        if not renderer:
            return None
        
        # Determine renderer type
        if "musicTwoRowItemRenderer" in renderer:
            data = renderer["musicTwoRowItemRenderer"]
            title = self.get_runs_text(data.get("title", {}))
            subtitle = self.get_runs_text(data.get("subtitle", {}))
            
            # Thumbnail using new robust helper
            thumb = self.extract_thumbnail(data)
            
            # Nav endpoints
            nav = data.get("navigationEndpoint", {})
            video_id = nav.get("watchEndpoint", {}).get("videoId")
            playlist_id = nav.get("watchEndpoint", {}).get("playlistId") or nav.get("watchPlaylistEndpoint", {}).get("playlistId")
            browse_id = nav.get("browseEndpoint", {}).get("browseId")
            
            # Check overlay play button for watch/playlist endpoint fallbacks
            overlay = data.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {}) or data.get("thumbnailOverlay", {}).get("musicItemThumbnailOverlayRenderer", {})
            play_nav = overlay.get("content", {}).get("musicPlayButtonRenderer", {}).get("playNavigationEndpoint", {})
            if not video_id:
                video_id = play_nav.get("watchEndpoint", {}).get("videoId")
            if not playlist_id:
                playlist_id = play_nav.get("watchEndpoint", {}).get("playlistId") or play_nav.get("watchPlaylistEndpoint", {}).get("playlistId")
            if not browse_id:
                browse_id = play_nav.get("browseEndpoint", {}).get("browseId")
            
            # Page type classification
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
                
            # If thumb is empty and we have a video_id, use standard YouTube thumbnail
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
                title = self.get_runs_text(flex_cols[0].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}))
            if len(flex_cols) > 1:
                subtitle = self.get_runs_text(flex_cols[1].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}))
                
            # Thumbnail using new robust helper
            thumb = self.extract_thumbnail(data)
            
            # Video ID / Browse ID / Playlist ID
            playlist_item_data = data.get("playlistItemData", {})
            video_id = playlist_item_data.get("videoId")
            
            nav = data.get("navigationEndpoint", {})
            if "watchEndpoint" in nav:
                video_id = nav["watchEndpoint"].get("videoId")
            playlist_id = nav.get("watchEndpoint", {}).get("playlistId") or nav.get("watchPlaylistEndpoint", {}).get("playlistId")
            browse_id = nav.get("browseEndpoint", {}).get("browseId")
            
            # Check overlay play button
            overlay = data.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {}) or data.get("thumbnailOverlay", {}).get("musicItemThumbnailOverlayRenderer", {})
            play_nav = overlay.get("content", {}).get("musicPlayButtonRenderer", {}).get("playNavigationEndpoint", {})
            if not video_id:
                video_id = play_nav.get("watchEndpoint", {}).get("videoId")
            if not playlist_id:
                playlist_id = play_nav.get("watchEndpoint", {}).get("playlistId") or play_nav.get("watchPlaylistEndpoint", {}).get("playlistId")
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
                
            # If thumb is empty and we have a video_id, use standard YouTube thumbnail
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

    def handle_search(self, query):
        if not query:
            self.send_json({"results": []})
            return

        body = {"query": query, "params": "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D"}
        response = self.make_ytm_request("search", body, "WEB_REMIX")
        if not response:
            self.send_error(502, "Bad Gateway calling YouTube Music")
            return

        results = []
        try:
            # Walk contents to search list
            tabs = response.get("contents", {}).get("tabbedSearchResultsRenderer", {}).get("tabs", [])
            if tabs:
                tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
                sections = tab_content.get("sectionListRenderer", {}).get("contents", [])
                
                for section in sections:
                    if "musicCardShelfRenderer" in section:
                        card = section["musicCardShelfRenderer"]
                        title = self.get_runs_text(card.get("title", {}))
                        subtitle = self.get_runs_text(card.get("subtitle", {}))
                        
                        video_id = card.get("buttons", [{}])[0].get("buttonRenderer", {}).get("command", {}).get("watchEndpoint", {}).get("videoId")
                        browse_id = card.get("title", {}).get("runs", [{}])[0].get("navigationEndpoint", {}).get("browseEndpoint", {}).get("browseId")
                        
                        thumb = self.extract_thumbnail(card)
                        
                        item_type = "song" if video_id else ("artist" if browse_id and browse_id.startswith("UC") else "album")
                        
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
                        shelf_title = self.get_runs_text(shelf.get("title", {}))
                        
                        contents = shelf.get("contents", [])
                        for content in contents:
                            item = content.get("musicResponsiveListItemRenderer")
                            if not item:
                                continue
                            
                            title = ""
                            subtitle = ""
                            video_id = None
                            browse_id = None
                            
                            flex_cols = item.get("flexColumns", [])
                            if len(flex_cols) > 0:
                                title = self.get_runs_text(flex_cols[0].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}))
                            if len(flex_cols) > 1:
                                subtitle = self.get_runs_text(flex_cols[1].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}))
                            
                            playlist_item_data = item.get("playlistItemData", {})
                            video_id = playlist_item_data.get("videoId")
                            
                            nav = item.get("navigationEndpoint", {})
                            if "watchEndpoint" in nav:
                                video_id = nav["watchEndpoint"].get("videoId")
                            elif "browseEndpoint" in nav:
                                browse_id = nav["browseEndpoint"].get("browseId")
                                
                            if not video_id:
                                overlay = item.get("overlay", {}).get("musicItemThumbnailOverlayRenderer", {})
                                video_id = overlay.get("content", {}).get("musicPlayButtonRenderer", {}).get("playNavigationEndpoint", {}).get("watchEndpoint", {}).get("videoId")

                            thumb = self.extract_thumbnail(item)
                            
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
                                if browse_id.startswith("UC"):
                                    item_type = "artist"
                                else:
                                    item_type = "album"
                                    
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

        self.send_json({"results": results})

    def handle_suggestions(self, query):
        if not query:
            self.send_json({"suggestions": []})
            return

        body = {"input": query}
        response = self.make_ytm_request("music/get_search_suggestions", body, "WEB_REMIX")
        if not response:
            self.send_json({"suggestions": []})
            return

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

        self.send_json({"suggestions": suggestions})

    def handle_home(self):
        body = {"browseId": "FEmusic_home"}
        response = self.make_ytm_request("browse", body, "WEB_REMIX")
        if not response:
            self.send_error(502, "Failed to load home feed from YouTube")
            return
            
        shelves = []
        try:
            tabs = response.get("contents", {}).get("singleColumnBrowseResultsRenderer", {}).get("tabs", [])
            if tabs:
                tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
                sections = tab_content.get("sectionListRenderer", {}).get("contents", [])
                
                for section in sections:
                    if "musicCarouselShelfRenderer" in section:
                        carousel = section["musicCarouselShelfRenderer"]
                        header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                        title = self.get_runs_text(header.get("title", {}))
                        
                        items = []
                        for content in carousel.get("contents", []):
                            item = self.parse_item_renderer(content)
                            if item:
                                items.append(item)
                                
                        if items:
                            shelves.append({
                                "title": title,
                                "items": items
                            })
        except Exception as e:
            print(f"Error parsing home feed: {e}")
            
        self.send_json({"shelves": shelves})

    def handle_explore(self):
        body = {"browseId": "FEmusic_explore"}
        response = self.make_ytm_request("browse", body, "WEB_REMIX")
        if not response:
            self.send_error(502, "Failed to load explore feed from YouTube")
            return
            
        new_releases = []
        moods_genres = []
        try:
            tabs = response.get("contents", {}).get("singleColumnBrowseResultsRenderer", {}).get("tabs", [])
            if tabs:
                tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
                sections = tab_content.get("sectionListRenderer", {}).get("contents", [])
                
                for section in sections:
                    if "musicCarouselShelfRenderer" in section:
                        carousel = section["musicCarouselShelfRenderer"]
                        header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                        title = self.get_runs_text(header.get("title", {}))
                        
                        if "new releases" in title.lower() or "album" in title.lower():
                            for content in carousel.get("contents", []):
                                item = self.parse_item_renderer(content)
                                if item:
                                    new_releases.append(item)
                                    
                        elif "mood" in title.lower() or "genre" in title.lower():
                            for content in carousel.get("contents", []):
                                btn = content.get("musicNavigationButtonRenderer", {})
                                if btn:
                                    btn_title = self.get_runs_text(btn.get("buttonText", {}))
                                    browse_id = btn.get("clickCommand", {}).get("browseEndpoint", {}).get("browseId")
                                    moods_genres.append({
                                        "title": btn_title,
                                        "id": browse_id,
                                        "type": "playlist"
                                    })
        except Exception as e:
            print(f"Error parsing explore feed: {e}")
            
        self.send_json({
            "newReleases": new_releases,
            "moodsAndGenres": moods_genres
        })

    def handle_charts(self):
        body = {"browseId": "FEmusic_charts"}
        response = self.make_ytm_request("browse", body, "WEB_REMIX")
        if not response:
            self.send_error(502, "Failed to load charts from YouTube")
            return
            
        charts = []
        try:
            tabs = response.get("contents", {}).get("singleColumnBrowseResultsRenderer", {}).get("tabs", [])
            if tabs:
                tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
                sections = tab_content.get("sectionListRenderer", {}).get("contents", [])
                
                for section in sections:
                    if "musicCarouselShelfRenderer" in section:
                        carousel = section["musicCarouselShelfRenderer"]
                        header = carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {})
                        title = self.get_runs_text(header.get("title", {}))
                        
                        items = []
                        for content in carousel.get("contents", []):
                            item = self.parse_item_renderer(content)
                            if item:
                                items.append(item)
                                
                        if items:
                            charts.append({
                                "title": title,
                                "items": items
                            })
        except Exception as e:
            print(f"Error parsing charts feed: {e}")
            
        self.send_json({"charts": charts})

    def handle_petdex_manifest(self):
        url = "https://petdex.crafter.run/api/manifest"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        req = urllib.request.Request(url, headers=headers)
        try:
            # Avoid SSL cert verification issues on local setups
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=context) as response:
                content = response.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            print(f"Error fetching petdex manifest: {e}")
            self.send_error(502, f"Failed to fetch Petdex manifest: {e}")

    def handle_browse(self, browse_id):
        if not browse_id:
            self.send_error(400, "Missing id parameter")
            return
            
        body = {"browseId": browse_id}
        response = self.make_ytm_request("browse", body, "WEB_REMIX")
        if not response:
            self.send_error(502, "Failed to load details from YouTube")
            return
            
        details = {}
        try:
            # 1. Try to extract header from root response first
            header = response.get("header", {})
            details["id"] = browse_id
            
            if "musicHeaderRenderer" in header:
                details["title"] = self.get_runs_text(header["musicHeaderRenderer"].get("title", {}))
                details["subtitle"] = self.get_runs_text(header["musicHeaderRenderer"].get("subtitle", {}))
            elif "musicDetailHeaderRenderer" in header:
                details["title"] = self.get_runs_text(header["musicDetailHeaderRenderer"].get("title", {}))
                details["subtitle"] = self.get_runs_text(header["musicDetailHeaderRenderer"].get("subtitle", {}))
                details["description"] = self.get_runs_text(header["musicDetailHeaderRenderer"].get("description", {}))
                thumbnails = header["musicDetailHeaderRenderer"].get("thumbnail", {}).get("croppedSquareThumbnailRenderer", {}).get("thumbnail", {}).get("thumbnails", [])
                details["thumbnail"] = thumbnails[-1]["url"] if thumbnails else ""
            elif "musicImmersiveHeaderRenderer" in header:
                details["title"] = self.get_runs_text(header["musicImmersiveHeaderRenderer"].get("title", {}))
                thumbnails = header["musicImmersiveHeaderRenderer"].get("thumbnail", {}).get("musicThumbnailRenderer", {}).get("thumbnail", {}).get("thumbnails", [])
                details["thumbnail"] = thumbnails[-1]["url"] if thumbnails else ""

            # 2. Collect all section list contents
            contents = response.get("contents", {})
            all_sections = []
            
            # Extract sections from tabs
            tabs = []
            if "singleColumnBrowseResultsRenderer" in contents:
                tabs = contents["singleColumnBrowseResultsRenderer"].get("tabs", [])
            elif "twoColumnBrowseResultsRenderer" in contents:
                tabs = contents["twoColumnBrowseResultsRenderer"].get("tabs", [])
                
            for tab in tabs:
                tab_sections = tab.get("tabRenderer", {}).get("content", {}).get("sectionListRenderer", {}).get("contents", [])
                all_sections.extend(tab_sections)
                
            # Extract sections from secondaryContents
            if "twoColumnBrowseResultsRenderer" in contents:
                sec_contents = contents["twoColumnBrowseResultsRenderer"].get("secondaryContents", {})
                if "sectionListRenderer" in sec_contents:
                    all_sections.extend(sec_contents["sectionListRenderer"].get("contents", []))
                elif "musicPlaylistShelfRenderer" in sec_contents:
                    all_sections.append({"musicPlaylistShelfRenderer": sec_contents["musicPlaylistShelfRenderer"]})
                elif "musicShelfRenderer" in sec_contents:
                    all_sections.append({"musicShelfRenderer": sec_contents["musicShelfRenderer"]})

            # 3. Parse all sections
            tracks = []
            sections_data = []
            
            for section in all_sections:
                if "musicResponsiveHeaderRenderer" in section:
                    hdr = section["musicResponsiveHeaderRenderer"]
                    if not details.get("title"):
                        details["title"] = self.get_runs_text(hdr.get("title", {}))
                    if not details.get("subtitle"):
                        sub_text = self.get_runs_text(hdr.get("subtitle", {}))
                        sec_sub_text = self.get_runs_text(hdr.get("secondSubtitle", {}))
                        details["subtitle"] = f"{sub_text} • {sec_sub_text}" if sub_text and sec_sub_text else (sub_text or sec_sub_text)
                    if not details.get("thumbnail"):
                        details["thumbnail"] = self.extract_thumbnail(hdr)
                        
                elif "musicPlaylistShelfRenderer" in section:
                    shelf = section["musicPlaylistShelfRenderer"]
                    for content in shelf.get("contents", []):
                        track = self.parse_item_renderer(content)
                        if track:
                            tracks.append(track)
                            
                elif "musicShelfRenderer" in section:
                    shelf = section["musicShelfRenderer"]
                    shelf_title = self.get_runs_text(shelf.get("title", {}))
                    shelf_tracks = []
                    for content in shelf.get("contents", []):
                        track = self.parse_item_renderer(content)
                        if track:
                            if browse_id.startswith("UC"):
                                shelf_tracks.append(track)
                            else:
                                tracks.append(track)
                    if shelf_tracks:
                        sections_data.append({
                            "title": shelf_title or "Songs",
                            "items": shelf_tracks
                        })
                        
                elif "musicCarouselShelfRenderer" in section:
                    carousel = section["musicCarouselShelfRenderer"]
                    title = self.get_runs_text(carousel.get("header", {}).get("musicCarouselShelfBasicHeaderRenderer", {}).get("title", {}))
                    items = []
                    for content in carousel.get("contents", []):
                        item = self.parse_item_renderer(content)
                        if item:
                            items.append(item)
                    if items:
                        sections_data.append({
                            "title": title,
                            "items": items
                        })
                        
                elif "gridRenderer" in section:
                    grid = section["gridRenderer"]
                    title = self.get_runs_text(grid.get("header", {}).get("gridHeaderRenderer", {}).get("title", {}))
                    items = []
                    for content in grid.get("items", []):
                        item = self.parse_item_renderer(content)
                        if item:
                            items.append(item)
                    if items:
                        sections_data.append({
                            "title": title,
                            "items": items
                        })

            # If still no title/thumbnail, try microformat fallback
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
                
            # Enrich for CompletelyLiving Albums Experience
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
            
        self.send_json(details)

    def resolve_stream_url(self, video_id):
        """Use yt-dlp to get the highest-quality stream URL and exact metadata."""
        try:
            res = subprocess.run(
                [
                    "python3", "-m", "yt_dlp",
                    "--dump-json",
                    # Prefer 256kbps AAC (itag 141) for Hi-Lossless, then best m4a, then any best audio
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
                
                # Get the exact content length of this specific format to prevent 416 Range errors
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

    def handle_stream(self, video_id):
        if not video_id:
            self.send_error(400, "Missing id parameter")
            return

        # Check Cache
        now = time.time()
        if video_id in STREAM_CACHE:
            cached = STREAM_CACHE[video_id]
            if cached.get("expire", 0) > now + 600:
                print(f"[CACHE] Serving cached stream response for {video_id}")
                self.send_json(cached["response"])
                return

        print(f"Requesting stream details for video: {video_id}")
        
        # --- Primary: yt-dlp resolver (100% correct, exact filesize, robust) ---
        solved_url, content_length, metadata = self.resolve_stream_url(video_id)
        if solved_url and metadata:
            proxied_url = f"/api/proxy_stream?url={urllib.parse.quote(solved_url)}&len={content_length}"
            
            # Parse expiration from URL
            expire_val = int(now + 3600) # default fallback 1 hour
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
            
            # Cache the response
            STREAM_CACHE[video_id] = {
                "response": resp_dict,
                "expire": expire_val
            }
            
            self.send_json(resp_dict)
            return

        # --- Secondary/Fallback: Instant InnerTube client cascade ---
        print(f"[WARNING] Primary yt-dlp resolver failed. Falling back to InnerTube cascade...")
        client_cookie = self.headers.get("X-Ytm-Cookie") or self.headers.get("x-ytm-cookie")
        body = {"videoId": video_id}
        fallback_order = ["ANDROID_VR", "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "TVHTML5", "WEB_REMIX", "ANDROID", "IOS"]
        response = None
        streaming_data = None
        
        for client_key in fallback_order:
            res = self.make_ytm_request("player", body, client_key)
            if res and "streamingData" in res:
                play_status = res.get("playabilityStatus", {})
                status = play_status.get("status")
                if status == "OK":
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

                    # Cache the response
                    STREAM_CACHE[video_id] = {
                        "response": resp_dict,
                        "expire": expire_val
                    }

                    self.send_json(resp_dict)
                    return
        
        self.send_error(500, "Could not resolve stream URL")

    def fetch_chunk(self, target_url, start, end, cookie_param=None):
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

    def handle_proxy_stream(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        target_url = query_params.get("url", [""])[0]
        cookie_param = query_params.get("cookie", [""])[0]
        content_length = int(query_params.get("len", ["0"])[0])
        
        if not target_url:
            self.send_error(400, "Missing url parameter")
            return

        # YouTube CDN caps anonymous streams at 1MB per range request.
        # We internally loop fetching 1MB chunks and stream them all to the browser
        # as one seamless, continuous response — supporting full track playback and seeking.
        CHUNK_SIZE = 1024 * 1024  # 1MB per CDN request

        # Parse the browser's Range request to support seeking
        range_header = self.headers.get("Range") or self.headers.get("range")
        req_start = 0
        req_end = content_length - 1 if content_length > 0 else None

        if range_header:
            m = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if m:
                req_start = int(m.group(1))
                if m.group(2):
                    req_end = int(m.group(2))

        # Probe first chunk to get content-type (and real content-length if unknown)
        probe_end = min(req_start + CHUNK_SIZE - 1, req_end) if req_end is not None else req_start + CHUNK_SIZE - 1
        print(f"[PROXY] Streaming {target_url[:60]}... start={req_start} end={req_end}")

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
                content_type = probe_resp.getheader("Content-Type", "audio/mp4")
                # Try to get the real total length from Content-Range header
                cr = probe_resp.getheader("Content-Range", "")
                if cr and "/" in cr:
                    try:
                        total = int(cr.split("/")[1])
                        if req_end is None or req_end >= total:
                            req_end = total - 1
                        if content_length == 0:
                            content_length = total
                    except ValueError:
                        pass

                serve_length = (req_end - req_start + 1) if req_end is not None else None

                # Send response headers
                if range_header and req_end is not None:
                    self.send_response(206)
                    self.send_header("Content-Range", f"bytes {req_start}-{req_end}/{content_length or '*'}")
                else:
                    self.send_response(200)

                self.send_header("Content-Type", content_type)
                if serve_length is not None:
                    self.send_header("Content-Length", str(serve_length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                # Stream the first chunk
                try:
                    while True:
                        data = probe_resp.read(65536)
                        if not data:
                            break
                        self.wfile.write(data)
                except (ConnectionResetError, BrokenPipeError):
                    return

            # Now loop fetching subsequent 1MB chunks until req_end is satisfied
            if req_end is not None:
                current = req_start + CHUNK_SIZE
                while current <= req_end:
                    chunk_end = min(current + CHUNK_SIZE - 1, req_end)
                    try:
                        with self.fetch_chunk(target_url, current, chunk_end, cookie_param) as resp:
                            try:
                                while True:
                                    data = resp.read(65536)
                                    if not data:
                                        break
                                    self.wfile.write(data)
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
            try:
                self.send_error(500, f"Proxy error: {e}")
            except:
                pass

    def fetch_lrclib_lyrics(self, title, artist):
        params = {"track_name": title}
        if artist:
            params["artist_name"] = artist
        search_query = urllib.parse.urlencode(params)
        lrc_url = f"https://lrclib.net/api/get?{search_query}"
        
        req = urllib.request.Request(lrc_url, headers={"User-Agent": "Zynic / 1.0"})
        try:
            # Avoid SSL issues
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=context) as response:
                data = json.loads(response.read().decode("utf-8"))
                synced_lyrics = data.get("syncedLyrics")
                plain_lyrics = data.get("plainLyrics")
                
                if synced_lyrics:
                    self.send_json({
                        "synced": True,
                        "lyrics": synced_lyrics
                    })
                    return True
                elif plain_lyrics:
                    self.send_json({
                        "synced": False,
                        "lyrics": plain_lyrics
                    })
                    return True
        except Exception as e:
            print(f"[LRCLIB] Fetch failed for '{title}' / '{artist}': {e}")
        return False

    def handle_lyrics(self, title, artist):
        if not title:
            self.send_json({"synced": False, "lyrics": "Search for a song first."})
            return

        # 1. Try first with the full artist list
        if self.fetch_lrclib_lyrics(title, artist):
            return
            
        # 2. Fallback: Split and try with primary artist only
        primary_artist = artist
        for sep in [",", "&", "feat.", "ft.", "and"]:
            if sep in primary_artist:
                primary_artist = primary_artist.split(sep)[0].strip()
                
        if primary_artist != artist:
            print(f"[LYRICS FALLBACK] Trying primary artist: '{primary_artist}'")
            if self.fetch_lrclib_lyrics(title, primary_artist):
                return
                
        # 3. Last fallback: Try with just the title (no artist check)
        print(f"[LYRICS FALLBACK] Trying title search only: '{title}'")
        if self.fetch_lrclib_lyrics(title, ""):
            return
            
        self.send_json({
            "synced": False,
            "lyrics": "Lyrics not found for this song."
        })

    def handle_proxy_image(self, image_url):
        if not image_url:
            self.send_error(400, "Missing url parameter")
            return
        try:
            req = urllib.request.Request(
                image_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
                }
            )
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=context) as response:
                content = response.read()
                content_type = response.getheader("Content-Type", "image/jpeg")
                
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            print(f"[IMAGE PROXY] Failed to proxy image: {e}")
            self.send_error(502, f"Failed to proxy image: {e}")

    def send_json(self, data):
        content = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_rooms_list(self):
        rooms_list = []
        for r_id, r in ROOMS_CACHE.items():
            rooms_list.append({
                "id": r["id"],
                "name": r["name"],
                "host": r["host"],
                "type": r["type"],
                "current_track": r["activeTrack"],
                "listener_count": len(r["listeners"]) + 1
            })
        self.send_json({"rooms": rooms_list})

    def handle_rooms_create(self, name, r_type, host):
        if not name:
            name = "Collaborative Listening Room 🎧"
        r_id = "room-" + str(int(time.time()))
        ROOMS_CACHE[r_id] = {
            "id": r_id,
            "name": name,
            "host": host if host else "Anonymous Host",
            "type": r_type if r_type in ["democratic", "host-only"] else "democratic",
            "activeTrack": None,
            "progress": 0,
            "listeners": [],
            "chat": [
                {"user": "System", "message": f"Room '{name}' created by {host}.", "timestamp": int(time.time() * 1000)}
            ],
            "queue": [],
            "recording": False,
            "recordedLogs": []
        }
        self.send_json({"status": "success", "room_id": r_id})

    def handle_rooms_get(self, r_id):
        room = ROOMS_CACHE.get(r_id)
        if not room:
            self.send_error(404, "Room not found")
            return

        if room.get("activeTrack") and room.get("progress", 0) > 0:
            room["progress"] = (room["progress"] + 3) % 240

        current_track = None
        if room.get("activeTrack"):
            current_track = dict(room["activeTrack"])
            current_track["progress"] = min(100, (room.get("progress", 0) / 240) * 100)

        messages = [
            {"user": c["user"], "text": c.get("message", c.get("text", "")), "timestamp": c.get("timestamp", 0)}
            for c in room.get("chat", [])
        ]

        self.send_json({
            "id": room["id"],
            "name": room["name"],
            "host": room["host"],
            "type": room["type"],
            "current_track": current_track,
            "queue": room.get("queue", []),
            "messages": messages,
            "listener_count": len(room.get("listeners", [])) + 1
        })

    def handle_rooms_action(self, r_id, action, params):
        room = ROOMS_CACHE.get(r_id)
        if not room:
            self.send_error(404, "Room not found")
            return
        
        user = params.get("user", ["Guest User"])[0]
        
        if action == "join":
            if not any(l["name"] == user for l in room["listeners"]):
                room["listeners"].append({"name": user, "avatar": "fa-user-circle"})
                room["chat"].append({
                    "user": "System", 
                    "message": f"{user} joined the room.", 
                    "timestamp": int(time.time() * 1000)
                })
                
        elif action == "chat":
            msg = params.get("message", [""])[0]
            if msg:
                chat_entry = {
                    "user": user,
                    "message": msg,
                    "timestamp": int(time.time() * 1000)
                }
                room["chat"].append(chat_entry)
                if room.get("recording"):
                    room["recordedLogs"].append({"type": "chat", "data": chat_entry})
                    
        elif action == "vote":
            track_id = params.get("trackId", [""])[0]
            vote_dir = params.get("direction", ["up"])[0]
            
            queue_item = next((item for item in room["queue"] if item["id"] == track_id), None)
            if queue_item:
                if vote_dir == "up":
                    queue_item["votes"] += 1
                else:
                    queue_item["votes"] -= 1
                
                room["queue"].sort(key=lambda x: x["votes"], reverse=True)
                
                vote_entry = f"{user} voted {vote_dir} on '{queue_item['title']}'."
                if room.get("recording"):
                    room["recordedLogs"].append({"type": "vote", "data": vote_entry, "timestamp": int(time.time() * 1000)})
                    
        elif action == "add_to_queue":
            track_id = params.get("trackId", [""])[0]
            title = params.get("title", [""])[0]
            artist = params.get("artist", [""])[0]
            thumb = params.get("thumbnail", [""])[0]
            
            if track_id and title:
                new_item = {
                    "id": track_id,
                    "title": title,
                    "artist": artist,
                    "thumbnail": thumb,
                    "votes": 0,
                    "votedUsers": []
                }
                room["queue"].append(new_item)
                room["queue"].sort(key=lambda x: x["votes"], reverse=True)
                
                room["chat"].append({
                    "user": "System",
                    "message": f"'{title}' added to collaborative queue by {user}.",
                    "timestamp": int(time.time() * 1000)
                })
                if room.get("recording"):
                    room["recordedLogs"].append({"type": "add_to_queue", "data": new_item})
                    
        elif action == "host_control":
            cmd = params.get("command", [""])[0]
            
            if cmd == "skip":
                if len(room["queue"]) > 0:
                    next_track = room["queue"].pop(0)
                    room["activeTrack"] = {
                        "id": next_track["id"],
                        "title": next_track["title"],
                        "artist": next_track["artist"],
                        "thumbnail": next_track["thumbnail"]
                    }
                    room["progress"] = 0
                    skip_msg = f"Host skipped current track. Now playing: '{next_track['title']}'."
                    room["chat"].append({
                        "user": "System",
                        "message": skip_msg,
                        "timestamp": int(time.time() * 1000)
                    })
                    if room.get("recording"):
                        room["recordedLogs"].append({"type": "skip", "data": next_track})
                else:
                    room["activeTrack"] = None
                    room["progress"] = 0
                    
            elif cmd == "toggle_record":
                room["recording"] = not room.get("recording")
                rec_msg = f"Session recording {'started' if room['recording'] else 'paused'} by host."
                room["chat"].append({
                    "user": "System",
                    "message": rec_msg,
                    "timestamp": int(time.time() * 1000)
                })
                if not room["recording"] and len(room.get("recordedLogs", [])) > 0:
                    try:
                        os.makedirs("cache", exist_ok=True)
                        filepath = f"cache/session_{room['id']}_{int(time.time())}.json"
                        with open(filepath, "w") as f:
                            json.dump(room["recordedLogs"], f, indent=4)
                        room["chat"].append({
                            "user": "System",
                            "message": f"Session logs successfully saved to server: {filepath}",
                            "timestamp": int(time.time() * 1000)
                        })
                    except Exception as e:
                        print("Error writing session logs:", e)
                        
            elif cmd == "download_record":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Disposition", f"attachment; filename=session_{r_id}.json")
                self.end_headers()
                self.wfile.write(json.dumps(room.get("recordedLogs", [])).encode('utf-8'))
                return
        
        self.send_json({"status": "success"})

    def handle_rooms_action_json(self, body):
        r_id = body.get('room_id', '')
        action = body.get('action', '')
        room = ROOMS_CACHE.get(r_id)
        if not room:
            self.send_error(404, "Room not found")
            return

        user = body.get('user', 'Guest User')

        if action == 'join':
            if not any(l["name"] == user for l in room["listeners"]):
                room["listeners"].append({"name": user, "avatar": "fa-user-circle"})
                room["chat"].append({"user": "System", "message": f"{user} joined the room.", "timestamp": int(time.time() * 1000)})

        elif action == 'chat':
            msg = body.get('text', body.get('message', ''))
            if msg:
                room["chat"].append({"user": user, "message": msg, "timestamp": int(time.time() * 1000)})

        elif action == 'vote':
            track_id = body.get('track_id', '')
            direction = body.get('direction', 1)
            queue_item = next((item for item in room["queue"] if item["id"] == track_id), None)
            if queue_item:
                if direction == 1 or direction == 'up':
                    queue_item["votes"] += 1
                else:
                    queue_item["votes"] -= 1
                room["queue"].sort(key=lambda x: x["votes"], reverse=True)

        elif action in ('add_song', 'add_to_queue'):
            track_id = body.get('track_id', body.get('trackId', ''))
            title = body.get('title', '')
            artist = body.get('artist', '')
            thumb = body.get('thumbnail', '')
            if track_id:
                if not title:
                    title = track_id
                new_item = {"id": track_id, "title": title, "artist": artist, "thumbnail": thumb, "votes": 0, "votedUsers": []}
                room["queue"].append(new_item)
                room["queue"].sort(key=lambda x: x["votes"], reverse=True)
                room["chat"].append({"user": "System", "message": f"'{title}' added to queue by {user}.", "timestamp": int(time.time() * 1000)})

        elif action in ('skip', 'play_pause', 'host_control'):
            cmd = body.get('command', action)
            if cmd in ('skip', 'skip'):
                if room.get("queue"):
                    next_track = room["queue"].pop(0)
                    room["activeTrack"] = {"id": next_track["id"], "title": next_track["title"], "artist": next_track["artist"], "thumbnail": next_track["thumbnail"]}
                    room["progress"] = 0
                    room["chat"].append({"user": "System", "message": f"Skipped. Now playing: '{next_track['title']}'.", "timestamp": int(time.time() * 1000)})
                else:
                    room["activeTrack"] = None

        self.send_json({"status": "success"})

    def handle_discover_mood(self, mood):
        mood_tracks = {
            "chill": [
                {"id": "5qap5aO4i9A", "title": "lofi hip hop radio - beats to relax/study to", "artist": "ChilledCow", "thumbnail": "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg", "bpm": 76, "key": "8A", "duration": "3:12"},
                {"id": "JzAP1D9BPEk", "title": "Deep Space Ambient Music (Lofi & Chill)", "artist": "Lofi Chill Out", "thumbnail": "https://i.ytimg.com/vi/JzAP1D9BPEk/hqdefault.jpg", "bpm": 60, "key": "11A", "duration": "5:12"},
                {"id": "TUT1dY2vN_U", "title": "Focus Lofi Chill beats for deep study", "artist": "Lofi Study", "thumbnail": "https://i.ytimg.com/vi/TUT1dY2vN_U/hqdefault.jpg", "bpm": 80, "key": "5B", "duration": "4:02"},
                {"id": "4xDzrJKXOOY", "title": "Synthwave Radio - Retro electro beats", "artist": "Lofi retro", "thumbnail": "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg", "bpm": 92, "key": "8B", "duration": "3:45"}
            ],
            "vibrant": [
                {"id": "9bZkp7q19f0", "title": "PSY - GANGNAM STYLE (강남스타일) M/V", "artist": "PSY", "thumbnail": "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", "bpm": 132, "key": "4A", "duration": "4:12"},
                {"id": "kJQP7kiw5Fk", "title": "Despacito ft. Daddy Yankee", "artist": "Luis Fonsi", "thumbnail": "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", "bpm": 89, "key": "6B", "duration": "4:41"}
            ],
            "melancholic": [
                {"id": "hLQl3WQQoQ0", "title": "Adele - Someone Like You (Official)", "artist": "Adele", "thumbnail": "https://i.ytimg.com/vi/hLQl3WQQoQ0/hqdefault.jpg", "bpm": 67, "key": "9B", "duration": "4:44"},
                {"id": "3AtDnEC4zak", "title": "Billie Eilish - when the party's over", "artist": "Billie Eilish", "thumbnail": "https://i.ytimg.com/vi/3AtDnEC4zak/hqdefault.jpg", "bpm": 83, "key": "11A", "duration": "3:13"}
            ],
            "focus": [
                {"id": "TUT1dY2vN_U", "title": "Focus Deep Binaural Beats", "artist": "Focus Ambient", "thumbnail": "https://i.ytimg.com/vi/TUT1dY2vN_U/hqdefault.jpg", "bpm": 60, "key": "10A", "duration": "6:00"},
                {"id": "JzAP1D9BPEk", "title": "Alpha Waves concentration lofi", "artist": "Study Radio", "thumbnail": "https://i.ytimg.com/vi/JzAP1D9BPEk/hqdefault.jpg", "bpm": 70, "key": "8B", "duration": "5:30"}
            ]
        }
        tracks = mood_tracks.get(mood, mood_tracks["chill"])
        self.send_json(tracks)

    def handle_discover_sounds_like(self, track_id):
        matches = [
            {"id": "5qap5aO4i9A", "title": "Lofi Night Study Horizon", "artist": "Acoustic Archive", "thumbnail": "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg", "bpm": 75, "key": "8A", "duration": "3:12", "matchPct": 97},
            {"id": "JzAP1D9BPEk", "title": "Supernal Space Ambient Loop", "artist": "Lofi Space", "thumbnail": "https://i.ytimg.com/vi/JzAP1D9BPEk/hqdefault.jpg", "bpm": 62, "key": "11A", "duration": "4:45", "matchPct": 92},
            {"id": "TUT1dY2vN_U", "title": "Cozy Rainy Day Study Beats", "artist": "Focus Loopers", "thumbnail": "https://i.ytimg.com/vi/TUT1dY2vN_U/hqdefault.jpg", "bpm": 80, "key": "5B", "duration": "3:58", "matchPct": 86}
        ]
        self.send_json(matches)

if __name__ == "__main__":
    os.makedirs(os.path.join(os.path.dirname(__file__), "public"), exist_ok=True)
    
    handler = YTMRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"web app zynic API Gateway & Server started on port {PORT}")
        print(f"Access it at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()
