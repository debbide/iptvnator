import { on } from '@ngrx/store';
import {
    getChannelPrimaryUrl,
    getChannelUrlIdentities,
} from 'shared-interfaces';
import { FavoritesActions } from '../actions';
import { PlaylistState } from '../state';

export const favoritesReducers = [
    on(FavoritesActions.updateFavorites, (state, action): PlaylistState => {
        const selectedId = state.playlists.selectedId;
        const playlist = state.playlists.entities[selectedId];
        if (!selectedId || !playlist) {
            return state;
        }

        const { channel } = action;
        const playlistFavorites = (playlist.favorites ?? []).filter(
            (favorite): favorite is string => typeof favorite === 'string'
        );
        const channelUrls = getChannelUrlIdentities(channel);
        const favoriteUrl = getChannelPrimaryUrl(channel);
        if (!favoriteUrl) {
            return state;
        }

        const isFavorite = channelUrls.some((url) =>
            playlistFavorites.includes(url)
        );
        const favorites = isFavorite
            ? playlistFavorites.filter((url) => !channelUrls.includes(url))
            : [...playlistFavorites, favoriteUrl];

        return {
            ...state,
            playlists: {
                ...state.playlists,
                entities: {
                    ...state.playlists.entities,
                    [selectedId]: {
                        ...playlist,
                        favorites,
                    },
                },
            },
        };
    }),
    on(FavoritesActions.setFavorites, (state, action): PlaylistState => {
        const selectedId = state.playlists.selectedId;
        const playlist = state.playlists.entities[selectedId];
        if (!selectedId || !playlist) {
            return state;
        }

        const { channelIds } = action;
        return {
            ...state,
            playlists: {
                ...state.playlists,
                entities: {
                    ...state.playlists.entities,
                    [selectedId]: {
                        ...playlist,
                        favorites: channelIds,
                    },
                },
            },
        };
    }),
];
