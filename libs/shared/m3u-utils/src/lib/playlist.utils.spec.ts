import { Channel, Playlist } from 'shared-interfaces';
import {
    aggregateFavoriteChannels,
    createPlaylistObject,
    getPlaylistEpgUrls,
} from './playlist.utils';

function createChannel(id: string, url: string, name = id): Channel {
    return {
        group: { title: 'Group' },
        http: {
            origin: '',
            referrer: '',
            'user-agent': '',
        },
        id,
        name,
        radio: 'false',
        tvg: {
            id,
            logo: '',
            name,
            rec: '',
            url: '',
        },
        url,
    };
}

function createPlaylist(
    id: string,
    channels: Channel[],
    favorites: Playlist['favorites']
): Playlist {
    return {
        _id: id,
        autoRefresh: false,
        count: channels.length,
        favorites,
        importDate: '2026-01-01T00:00:00.000Z',
        lastUsage: '2026-01-01T00:00:00.000Z',
        playlist: {
            items: channels,
        },
        title: id,
    };
}

describe('playlist utils', () => {
    it('aggregates M3U favorite channels with constant-time id and URL lookups', () => {
        const first = createChannel(
            'channel-1',
            'https://example.com/stream-1.m3u8',
            'Channel One'
        );
        const second = createChannel(
            'channel-2',
            'https://example.com/stream-2.m3u8',
            'Channel Two'
        );
        const third = createChannel(
            'channel-3',
            'https://example.com/stream-3.m3u8',
            'Channel Three'
        );

        const result = aggregateFavoriteChannels([
            createPlaylist(
                'playlist-1',
                [first, second],
                ['channel-1', 'missing-channel']
            ),
            createPlaylist(
                'playlist-2',
                [third],
                ['https://example.com/stream-3.m3u8']
            ),
        ]);

        expect(result).toEqual([first, third]);
    });

    it('aggregates M3U favorite channels by alternate stream URLs', () => {
        const channel = {
            ...createChannel(
                'channel-1',
                'https://example.com/primary.m3u8',
                'Channel One'
            ),
            alternateStreams: [
                {
                    label: 'Line 1',
                    url: 'https://example.com/primary.m3u8',
                },
                {
                    label: 'Line 2',
                    url: 'https://example.com/backup.m3u8',
                },
            ],
        };

        const result = aggregateFavoriteChannels([
            createPlaylist(
                'playlist-1',
                [channel],
                ['https://example.com/backup.m3u8']
            ),
        ]);

        expect(result).toEqual([channel]);
    });

    it('extracts EPG URLs from common M3U header attributes', () => {
        const epgUrls = getPlaylistEpgUrls({
            header: {
                attrs: {
                    'url-tvg':
                        'https://example.com/guide.xml https://mirror.example.com/guide.xml.gz',
                    'x-tvg-url': 'https://example.com/guide.xml',
                },
                raw: '#EXTM3U',
            },
            items: [],
        });

        expect(epgUrls).toEqual([
            'https://example.com/guide.xml',
            'https://mirror.example.com/guide.xml.gz',
        ]);
    });

    it('extracts unquoted EPG URLs from raw M3U headers', () => {
        const epgUrls = getPlaylistEpgUrls({
            header: {
                attrs: {},
                raw: '#EXTM3U url-tvg=https://example.com/guide.xml',
            },
            items: [],
        });

        expect(epgUrls).toEqual(['https://example.com/guide.xml']);
    });

    it('stores source-declared EPG URLs on imported playlists', () => {
        const playlist = createPlaylistObject('Playlist with guide', {
            header: {
                attrs: {},
                raw: '#EXTM3U url-tvg="https://example.com/guide.xml"',
            },
            items: [],
        });

        expect(playlist.epgUrls).toEqual(['https://example.com/guide.xml']);
    });

    it('keeps duplicate channel names with different tvg ids as separate channels', () => {
        const playlist = createPlaylistObject('Duplicate names', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'News',
                    tvgId: 'news-hd',
                    url: 'https://example.com/news-hd.m3u8',
                }),
                createParsedItem({
                    name: 'News',
                    tvgId: 'news-sd',
                    url: 'https://example.com/news-sd.m3u8',
                }),
            ],
        });

        expect(playlist.playlist.items).toHaveLength(2);
    });

    it('keeps non-consecutive duplicate tvg ids as separate channels', () => {
        const playlist = createPlaylistObject('Repeated id later', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'News',
                    tvgId: 'news',
                    url: 'https://example.com/news-one.m3u8',
                }),
                createParsedItem({
                    name: 'Sports',
                    tvgId: 'sports',
                    url: 'https://example.com/sports.m3u8',
                }),
                createParsedItem({
                    name: 'News',
                    tvgId: 'news',
                    url: 'https://example.com/news-two.m3u8',
                }),
            ],
        });

        expect(playlist.playlist.items).toHaveLength(3);
    });

    it('stores non-consecutive same-name group variants as alternate streams', () => {
        const playlist = createPlaylistObject('Grouped alternate streams', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'Satellite TV',
                    groupTitle: 'Satellite',
                    tvgName: 'Satellite TV',
                    tvgId: '',
                    url: 'https://line-one.example.com/satellite.m3u8',
                }),
                createParsedItem({
                    name: 'Different Channel',
                    groupTitle: 'Satellite',
                    tvgName: 'Different Channel',
                    tvgId: '',
                    url: 'https://example.com/different.m3u8',
                }),
                createParsedItem({
                    name: 'Satellite TV-MCP',
                    groupTitle: 'Satellite-MCP',
                    tvgName: 'Satellite TV',
                    tvgId: '',
                    url: 'https://line-two.example.com/satellite.m3u8',
                }),
            ],
        });

        expect(playlist.count).toBe(2);
        expect(playlist.playlist.items[0]).toEqual(
            expect.objectContaining({
                name: 'Satellite TV',
                alternateStreams: [
                    expect.objectContaining({
                        url: 'https://line-one.example.com/satellite.m3u8',
                    }),
                    expect.objectContaining({
                        url: 'https://line-two.example.com/satellite.m3u8',
                    }),
                ],
            })
        );
    });

    it('keeps same-name channels in unrelated groups separate', () => {
        const playlist = createPlaylistObject('Unrelated group names', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'News',
                    groupTitle: 'National',
                    tvgName: 'News',
                    tvgId: '',
                    url: 'https://example.com/national-news.m3u8',
                }),
                createParsedItem({
                    name: 'News',
                    groupTitle: 'Local',
                    tvgName: 'News',
                    tvgId: '',
                    url: 'https://example.com/local-news.m3u8',
                }),
            ],
        });

        expect(playlist.playlist.items).toHaveLength(2);
    });

    it('stores same-channel duplicate entries as alternate streams', () => {
        const playlist = createPlaylistObject('Alternate streams', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'News',
                    tvgId: 'news',
                    url: 'https://line-one.example.com/news.m3u8',
                    raw: '#EXTINF:-1 tvg-id="news" line-name="Primary",News',
                }),
                createParsedItem({
                    name: 'News',
                    tvgId: 'news',
                    url: 'https://line-two.example.com/news.m3u8',
                    raw: '#EXTINF:-1 tvg-id="news" line-name="Backup",News',
                }),
            ],
        });

        expect(playlist.count).toBe(1);
        expect(playlist.playlist.items[0]).toEqual(
            expect.objectContaining({
                url: 'https://line-one.example.com/news.m3u8',
                alternateStreams: [
                    expect.objectContaining({
                        label: 'Primary',
                        url: 'https://line-one.example.com/news.m3u8',
                    }),
                    expect.objectContaining({
                        label: 'Backup',
                        url: 'https://line-two.example.com/news.m3u8',
                    }),
                ],
            })
        );
    });

    it('extracts multiple stream URLs from a single raw EXTINF block', () => {
        const playlist = createPlaylistObject('Raw multi-url', {
            header: { attrs: {}, raw: '#EXTM3U' },
            items: [
                createParsedItem({
                    name: 'News',
                    tvgId: 'news',
                    url: 'https://line-one.example.com/news.m3u8',
                    raw: [
                        '#EXTINF:-1 tvg-id="news",News',
                        'https://line-one.example.com/news.m3u8',
                        'https://line-two.example.com/news.m3u8',
                    ].join('\n'),
                }),
            ],
        });

        expect(playlist.playlist.items[0]).toEqual(
            expect.objectContaining({
                alternateStreams: [
                    expect.objectContaining({
                        url: 'https://line-one.example.com/news.m3u8',
                    }),
                    expect.objectContaining({
                        url: 'https://line-two.example.com/news.m3u8',
                    }),
                ],
            })
        );
    });
});

function createParsedItem({
    groupTitle = 'News',
    name,
    raw,
    tvgId,
    tvgName,
    url,
}: {
    groupTitle?: string;
    name: string;
    raw?: string;
    tvgId: string;
    tvgName?: string;
    url: string;
}) {
    return {
        group: { title: groupTitle },
        http: {
            origin: '',
            referrer: '',
            'user-agent': '',
        },
        name,
        radio: 'false',
        raw: raw ?? `#EXTINF:-1 tvg-id="${tvgId}",${name}`,
        tvg: {
            id: tvgId,
            logo: '',
            name: tvgName ?? name,
            rec: '',
            url: '',
        },
        url,
    };
}
