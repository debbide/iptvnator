import {
    Channel,
    ChannelAlternateStream,
    getChannelPrimaryUrl,
    getChannelUrlIdentities,
    ParsedPlaylist,
    ParsedPlaylistItem,
    Playlist,
} from 'shared-interfaces';
import { v4 as uuidv4 } from 'uuid';

const EPG_HEADER_KEYS = ['x-tvg-url', 'url-tvg', 'tvg-url'];
const LINE_LABEL_KEYS = [
    'line-name',
    'line-title',
    'line',
    'source',
    'source-title',
];

/**
 * Aggregates favorite channels as objects from all available playlists
 * @param playlists all available playlists
 * @returns an array with favorite channels from all playlists
 */
export function aggregateFavoriteChannels(playlists: Playlist[]): Channel[] {
    const favorites: Channel[] = [];

    for (const playlist of playlists) {
        const favoriteIds = new Set(
            (playlist.favorites ?? []).filter(
                (favorite): favorite is string => typeof favorite === 'string'
            )
        );

        if (favoriteIds.size === 0) {
            continue;
        }

        for (const channel of playlist.playlist?.items ?? []) {
            if (
                favoriteIds.has(channel.id) ||
                getChannelUrlIdentities(channel).some((url) =>
                    favoriteIds.has(url)
                )
            ) {
                favorites.push(channel);
            }
        }
    }

    return favorites;
}

/**
 * Creates a simplified playlist object which is used for global favorites
 * @param channels channels list
 * @returns simplified playlist object
 */
export function createFavoritesPlaylist(
    channels: Channel[]
): Partial<Playlist> {
    return {
        _id: 'global-favorites',
        count: channels.length,
        playlist: {
            items: channels,
        },
        favorites: channels.map(getChannelPrimaryUrl),
        filename: 'Global favorites',
    };
}

/**
 * Returns last segment (part after last slash "/") of the given URL
 * @param value URL as string
 */
export const getFilenameFromUrl = (value: string): string => {
    if (value && value.length > 1) {
        return value.substring(value.lastIndexOf('/') + 1);
    }
    return 'Untitled playlist';
};

function normalizeUrlList(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(/[,\s]+/)
        .map((url) => url.trim())
        .filter(Boolean);
}

function getHeaderAttribute(
    attrs: Record<string, string | undefined> | undefined,
    key: string
): string | undefined {
    if (!attrs) {
        return undefined;
    }

    const normalizedKey = key.toLowerCase();
    const entry = Object.entries(attrs).find(
        ([attrKey]) => attrKey.toLowerCase() === normalizedKey
    );

    return entry?.[1];
}

export function getPlaylistEpgUrls(playlist: ParsedPlaylist): string[] {
    const urls = EPG_HEADER_KEYS.reduce<string[]>((acc, key) => {
        acc.push(
            ...normalizeUrlList(getPlaylistHeaderAttribute(playlist, key))
        );
        return acc;
    }, []);

    return Array.from(new Set(urls));
}

function getPlaylistHeaderAttribute(
    playlist: ParsedPlaylist,
    key: string
): string | undefined {
    const attrValue = getHeaderAttribute(playlist.header?.attrs, key);
    if (attrValue) {
        return attrValue;
    }

    const raw = playlist.header?.raw ?? '';
    return getRawAttribute(raw, key);
}

function getRawAttribute(raw: string, key: string): string | undefined {
    const match = raw.match(
        new RegExp(
            `${escapeRegExp(key)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s]+))`,
            'i'
        )
    );
    return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getParsedItemAttribute(
    item: ParsedPlaylistItem,
    key: string
): string | undefined {
    const attrs = (
        item as ParsedPlaylistItem & {
            attrs?: Record<string, string | undefined>;
        }
    ).attrs;

    const attrValue = getHeaderAttribute(attrs, key);
    if (attrValue) {
        return attrValue;
    }

    const raw = item.raw ?? '';
    return getRawAttribute(raw, key);
}

function getLineLabel(item: ParsedPlaylistItem): string | undefined {
    const explicitLabel = LINE_LABEL_KEYS.map((key) =>
        getParsedItemAttribute(item, key)
    ).find((value) => Boolean(value?.trim()));

    return explicitLabel?.trim() ?? getImplicitLineLabel(item);
}

function getImplicitLineLabel(item: ParsedPlaylistItem): string | undefined {
    const groupSuffix = getLineSuffix(item.group?.title);
    if (groupSuffix) {
        return groupSuffix;
    }

    return getLineSuffix(item.tvg?.name) ?? getLineSuffix(item.name);
}

function getLineSuffix(value: string | undefined): string | undefined {
    const match = value
        ?.trim()
        .match(/[-_（(](mcp|line\s*\d+|线路\s*\d+)[）)]?$/i);

    return match?.[1]?.replace(/\s+/g, '').toUpperCase();
}

function getChannelMergeIdentity(item: ParsedPlaylistItem): string {
    const tvgId = item.tvg?.id?.trim();
    if (tvgId) {
        return `tvg-id:${tvgId.toLowerCase()}`;
    }

    const name = (
        item.tvg?.name?.trim() ||
        item.name?.trim() ||
        ''
    ).toLowerCase();
    if (!name) {
        return '';
    }

    return `name:${item.group?.title?.trim().toLowerCase() || ''}:${name}`;
}

function getChannelNameIdentity(item: ParsedPlaylistItem): string {
    return (item.tvg?.name?.trim() || item.name?.trim() || '').toLowerCase();
}

function getChannelLineageIdentity(item: ParsedPlaylistItem): string {
    const name = getChannelNameIdentity(item);
    if (!name) {
        return '';
    }

    return getCctvChannelIdentity(name) ?? normalizeLineageName(name);
}

function getCctvChannelIdentity(name: string): string | null {
    const normalizedName = normalizeLineageName(name)
        .replace(/^央视/, 'cctv')
        .replace(/^中央电视台/, 'cctv');
    const match = normalizedName.match(/^cctv0*(\d+)(\+|p|plus)?/);

    if (!match) {
        return null;
    }

    const channelNumber = match[1];
    const plusSuffix = match[2] ? 'plus' : '';

    if (channelNumber === '4') {
        if (normalizedName.includes('欧洲') || normalizedName.includes('europe')) {
            return 'cctv4-europe';
        }

        if (
            normalizedName.includes('美洲') ||
            normalizedName.includes('america')
        ) {
            return 'cctv4-america';
        }
    }

    return `cctv${channelNumber}${plusSuffix}`;
}

function normalizeLineageName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[-_（(](?:mcp|line\d*|线路\d*)[）)]?$/i, '');
}

function getGroupFamily(title: string | undefined): string {
    return (title ?? '')
        .trim()
        .toLowerCase()
        .replace(/[-_(\uFF08][^-_(\uFF08]*$/, '')
        .trim();
}

function canMergeAsAlternateGroup(
    existingChannel: ParsedPlaylistItem,
    item: ParsedPlaylistItem
): boolean {
    if (existingChannel.tvg?.id?.trim() || item.tvg?.id?.trim()) {
        return false;
    }

    const nameIdentity = getChannelLineageIdentity(item);
    if (
        !nameIdentity ||
        nameIdentity !== getChannelLineageIdentity(existingChannel)
    ) {
        return false;
    }

    const existingGroupFamily = getGroupFamily(existingChannel.group?.title);
    const itemGroupFamily = getGroupFamily(item.group?.title);

    return Boolean(
        existingGroupFamily && existingGroupFamily === itemGroupFamily
    );
}

function isStreamUrl(line: string): boolean {
    return /^(https?|rtmps?|rtsp|udp|rtp|srt|file):\/\//i.test(line);
}

function getRawStreamUrls(item: ParsedPlaylistItem): string[] {
    return (item.raw ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && isStreamUrl(line));
}

function toAlternateStreams(
    item: ParsedPlaylistItem,
    startIndex: number
): ChannelAlternateStream[] {
    const urls = Array.from(new Set([item.url, ...getRawStreamUrls(item)]))
        .map((url) => url?.trim())
        .filter(Boolean);
    const lineLabel = getLineLabel(item);

    return urls.map((url, index) => {
        const labelIndex = startIndex + index;
        const label =
            lineLabel && urls.length === 1
                ? lineLabel
                : lineLabel
                  ? `${lineLabel} ${index + 1}`
                  : `Line ${labelIndex}`;

        return {
            id: uuidv4(),
            label,
            url,
            http: {
                referrer: item.http?.referrer,
                'user-agent': item.http?.['user-agent'],
                origin: item.http?.origin,
            },
        };
    });
}

function addAlternateStream(
    channel: ParsedPlaylistItem & {
        alternateStreams?: ChannelAlternateStream[];
    },
    stream: ChannelAlternateStream
): void {
    const existingStreams = channel.alternateStreams ?? [];
    if (existingStreams.some((item) => item.url === stream.url)) {
        return;
    }

    channel.alternateStreams = [...existingStreams, stream];
}

function normalizePlaylistItems(items: ParsedPlaylistItem[]): Channel[] {
    const channels: (ParsedPlaylistItem & {
        id: string;
        alternateStreams?: ChannelAlternateStream[];
    })[] = [];
    const channelsByNameAndGroupFamily = new Map<
        string,
        ParsedPlaylistItem & {
            id: string;
            alternateStreams?: ChannelAlternateStream[];
        }
    >();
    let previousIdentity = '';
    let previousChannel:
        | (ParsedPlaylistItem & {
              id: string;
              alternateStreams?: ChannelAlternateStream[];
          })
        | null = null;

    for (const item of items) {
        const alternateStreams = toAlternateStreams(item, 1);
        const channel: ParsedPlaylistItem & {
            id: string;
            alternateStreams?: ChannelAlternateStream[];
        } = {
            ...item,
            url: alternateStreams[0]?.url ?? item.url,
            id: uuidv4(),
        };
        const identity = getChannelMergeIdentity(item);
        const existingChannel =
            identity && identity === previousIdentity
                ? previousChannel
                : getExistingChannelByNameAndGroupFamily(
                      channelsByNameAndGroupFamily,
                      item
                  );

        if (!existingChannel) {
            channel.alternateStreams = alternateStreams;
            channels.push(channel);
            addChannelNameAndGroupFamilyIndex(
                channelsByNameAndGroupFamily,
                channel
            );
            previousIdentity = identity;
            previousChannel = channel;
            continue;
        }

        const nextIndex = (existingChannel.alternateStreams?.length ?? 0) + 1;
        for (const stream of toAlternateStreams(item, nextIndex)) {
            addAlternateStream(existingChannel, stream);
        }
    }

    return channels as Channel[];
}

function getChannelNameAndGroupFamilyKey(
    item: ParsedPlaylistItem
): string | null {
    const name = getChannelLineageIdentity(item);
    const groupFamily = getGroupFamily(item.group?.title);

    return name && groupFamily ? `${groupFamily}:${name}` : null;
}

function addChannelNameAndGroupFamilyIndex(
    channelsByNameAndGroupFamily: Map<
        string,
        ParsedPlaylistItem & {
            id: string;
            alternateStreams?: ChannelAlternateStream[];
        }
    >,
    channel: ParsedPlaylistItem & {
        id: string;
        alternateStreams?: ChannelAlternateStream[];
    }
): void {
    if (channel.tvg?.id?.trim()) {
        return;
    }

    const key = getChannelNameAndGroupFamilyKey(channel);
    if (key && !channelsByNameAndGroupFamily.has(key)) {
        channelsByNameAndGroupFamily.set(key, channel);
    }
}

function getExistingChannelByNameAndGroupFamily(
    channelsByNameAndGroupFamily: Map<
        string,
        ParsedPlaylistItem & {
            id: string;
            alternateStreams?: ChannelAlternateStream[];
        }
    >,
    item: ParsedPlaylistItem
):
    | (ParsedPlaylistItem & {
          id: string;
          alternateStreams?: ChannelAlternateStream[];
      })
    | null {
    const key = getChannelNameAndGroupFamilyKey(item);
    const existingChannel = key ? channelsByNameAndGroupFamily.get(key) : null;

    return existingChannel && canMergeAsAlternateGroup(existingChannel, item)
        ? existingChannel
        : null;
}

/**
 * Creates a playlist object
 * @param name name of the playlist
 * @param playlist playlist to save
 * @param urlOrPath absolute fs path or url of the playlist
 * @param uploadType upload type - by file or via an url
 */
export const createPlaylistObject = (
    name: string,
    playlist: ParsedPlaylist,
    urlOrPath?: string,
    uploadType?: 'URL' | 'FILE' | 'TEXT'
): Playlist => {
    const items = normalizePlaylistItems(playlist.items);
    const epgUrls = getPlaylistEpgUrls(playlist);

    return {
        _id: uuidv4(),
        filename: name,
        title: name,
        count: items.length,
        playlist: {
            ...playlist,
            items,
        },
        ...(epgUrls.length > 0 ? { epgUrls } : {}),
        importDate: new Date().toISOString(),
        lastUsage: new Date().toISOString(),
        favorites: [],
        autoRefresh: false,
        ...(uploadType === 'URL' ? { url: urlOrPath } : {}),
        ...(uploadType === 'FILE' ? { filePath: urlOrPath } : {}),
    };
};

export const getExtensionFromUrl = (url: string) => {
    return url.split(/[#?]/)[0].split('.').pop()?.trim();
};
