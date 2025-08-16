import json

from winsdk.windows.media.control import \
	GlobalSystemMediaTransportControlsSessionManager as MediaManager, \
	GlobalSystemMediaTransportControlsSessionPlaybackStatus
from datetime import timedelta
import sys, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def getMedia():
	sessions = await MediaManager.request_async()

	currentSession = sessions.get_current_session()
	if not currentSession:
		return None

	info = await currentSession.try_get_media_properties_async()
	info_dict = {song_attr: info.__getattribute__(song_attr) for song_attr in dir(info) if song_attr[0] != '_'}

	# converts winrt vector to list
	info_dict['genres'] = list(info_dict['genres'])

	pbinfo = currentSession.get_playback_info()

	info_dict['status'] = pbinfo.playback_status

	tlprops = currentSession.get_timeline_properties()

	if tlprops.end_time != timedelta(0):
		info_dict['pos'] = tlprops.position
		info_dict['end'] = tlprops.end_time

	return info_dict

def td_to_ms(td):
	return int((td.days * 86400 + td.seconds) * 1000 + td.microseconds / 1000)

def main():
	currentMedia = asyncio.run(getMedia())

	if currentMedia is None or GlobalSystemMediaTransportControlsSessionPlaybackStatus.PAUSED == currentMedia["status"]:
		return print("{\"Paused\": true}")

	dataStruct = {
		"Author": currentMedia["artist"],
		"Title": currentMedia["title"]
	}
	if currentMedia.get("pos") is None:
		dataStruct["Position"] = ["LIVE"]
	else:
		dataStruct["Position"] = [td_to_ms(currentMedia["pos"]), td_to_ms(currentMedia["end"])]

	return print(json.dumps(dataStruct))

main()