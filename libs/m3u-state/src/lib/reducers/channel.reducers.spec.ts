import { createReducer } from '@ngrx/store';
import { Channel } from 'shared-interfaces';
import { ChannelActions, FavoritesActions } from '../actions';
import { initialState } from '../state';
import { channelReducers } from './channel.reducers';
import { favoritesReducers } from './favorites.reducers';

const reducer = createReducer(
    initialState,
    ...channelReducers,
    ...favoritesReducers
);

describe('channelReducers', () => {
    const sampleChannel = {
        epgParams: '',
        http: {
            origin: '',
            referrer: '',
            'user-agent': '',
        },
        id: 'channel-1',
        name: 'Sample TV',
        radio: 'false',
        tvg: {
            id: 'sample-tvg-id',
            logo: '',
            name: 'Sample TV',
            rec: '',
            url: '',
        },
        url: 'https://example.com/live.m3u8',
    } as Channel;

    it('tracks explicit channel loading state', () => {
        const nextState = reducer(
            initialState,
            ChannelActions.setChannelsLoading({ loading: true })
        );

        expect(nextState.channelsLoading).toBe(true);
    });

    it('stores channels and clears the loading flag when channel data arrives', () => {
        const loadingState = reducer(
            initialState,
            ChannelActions.setChannelsLoading({ loading: true })
        );

        const nextState = reducer(
            loadingState,
            ChannelActions.setChannels({ channels: [sampleChannel] })
        );

        expect(nextState.channels).toEqual([sampleChannel]);
        expect(nextState.channelsLoading).toBe(false);
    });

    it('switches the active channel to a selected alternate stream', () => {
        const activeState = reducer(
            initialState,
            ChannelActions.setActiveChannelSuccess({
                channel: {
                    ...sampleChannel,
                    alternateStreams: [
                        {
                            label: 'Line 1',
                            url: 'https://example.com/live.m3u8',
                        },
                        {
                            label: 'Line 2',
                            url: 'https://backup.example.com/live.m3u8',
                            http: {
                                'user-agent': 'Backup Agent',
                                referrer: 'https://backup.example.com',
                                origin: 'https://origin.example.com',
                            },
                        },
                    ],
                },
            })
        );

        const nextState = reducer(
            {
                ...activeState,
                activePlaybackUrl: 'https://archive.example.com/replay.m3u8',
            },
            ChannelActions.setActiveChannelStream({
                url: 'https://backup.example.com/live.m3u8',
            })
        );

        expect(nextState.active?.url).toBe(
            'https://backup.example.com/live.m3u8'
        );
        expect(nextState.active?.http).toEqual(
            expect.objectContaining({
                'user-agent': 'Backup Agent',
                referrer: 'https://backup.example.com',
                origin: 'https://origin.example.com',
            })
        );
        expect(nextState.activePlaybackUrl).toBeNull();
    });

    it('toggles favorites by the primary channel URL after switching lines', () => {
        const selectedState = reducer(
            initialState,
            ChannelActions.setActiveChannelSuccess({
                channel: {
                    ...sampleChannel,
                    alternateStreams: [
                        {
                            label: 'Line 1',
                            url: 'https://example.com/live.m3u8',
                        },
                        {
                            label: 'Line 2',
                            url: 'https://backup.example.com/live.m3u8',
                        },
                    ],
                },
            })
        );
        const switchedState = reducer(
            selectedState,
            ChannelActions.setActiveChannelStream({
                url: 'https://backup.example.com/live.m3u8',
            })
        );
        const playlistState = {
            ...switchedState,
            playlists: {
                ...switchedState.playlists,
                selectedId: 'playlist-1',
                entities: {
                    'playlist-1': {
                        _id: 'playlist-1',
                        title: 'Playlist',
                        count: 1,
                        importDate: '2026-05-12T00:00:00.000Z',
                        lastUsage: '2026-05-12T00:00:00.000Z',
                        autoRefresh: false,
                        favorites: [],
                    },
                },
            },
        };

        const favoritedState = reducer(
            playlistState,
            FavoritesActions.updateFavorites({ channel: switchedState.active! })
        );

        expect(
            favoritedState.playlists.entities['playlist-1']?.favorites
        ).toEqual(['https://example.com/live.m3u8']);
    });

    it('removes legacy favorite URLs from any alternate stream identity', () => {
        const playlistState = {
            ...initialState,
            playlists: {
                ...initialState.playlists,
                selectedId: 'playlist-1',
                entities: {
                    'playlist-1': {
                        _id: 'playlist-1',
                        title: 'Playlist',
                        count: 1,
                        importDate: '2026-05-12T00:00:00.000Z',
                        lastUsage: '2026-05-12T00:00:00.000Z',
                        autoRefresh: false,
                        favorites: ['https://backup.example.com/live.m3u8'],
                    },
                },
            },
        };

        const nextState = reducer(
            playlistState,
            FavoritesActions.updateFavorites({
                channel: {
                    ...sampleChannel,
                    alternateStreams: [
                        {
                            label: 'Line 1',
                            url: 'https://example.com/live.m3u8',
                        },
                        {
                            label: 'Line 2',
                            url: 'https://backup.example.com/live.m3u8',
                        },
                    ],
                },
            })
        );

        expect(nextState.playlists.entities['playlist-1']?.favorites).toEqual(
            []
        );
    });
});
