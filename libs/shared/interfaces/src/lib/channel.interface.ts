/**
 * Represents channel object
 * TODO: define channel interface in iptv-parser library
 */
export interface ChannelAlternateStream {
    id?: string;
    label?: string;
    url: string;
    http?: Partial<Channel['http']>;
}

export function getChannelPrimaryUrl(
    channel: Pick<Channel, 'url' | 'alternateStreams'> | null | undefined
): string {
    const firstAlternateUrl = channel?.alternateStreams?.[0]?.url?.trim();
    return firstAlternateUrl || channel?.url || '';
}

export function getChannelUrlIdentities(
    channel: Pick<Channel, 'url' | 'alternateStreams'> | null | undefined
): string[] {
    const channelUrl = channel?.url?.trim();
    const alternateUrls = (channel?.alternateStreams ?? [])
        .map((stream) => stream.url?.trim())
        .filter((url): url is string => Boolean(url));
    const primaryUrl = alternateUrls[0] || channelUrl || '';
    const urls = [primaryUrl, channelUrl, ...alternateUrls].filter(
        (url): url is string => Boolean(url)
    );

    return Array.from(new Set(urls));
}

export function isChannelUrlIdentity(
    channel: Pick<Channel, 'url' | 'alternateStreams'> | null | undefined,
    url: string | undefined | null
): boolean {
    const normalizedUrl = url?.trim();
    return Boolean(
        normalizedUrl &&
        getChannelUrlIdentities(channel).includes(normalizedUrl)
    );
}

export interface Channel {
    id: string;
    url: string;
    alternateStreams?: ChannelAlternateStream[];
    name: string;
    group: {
        title: string;
    };
    tvg: {
        id: string;
        name: string;
        url: string;
        logo: string;
        rec: string;
    };
    epgParams?: string;
    timeshift?: string;
    catchup?: {
        type?: string;
        source?: string;
        days?: string;
    };
    http: {
        referrer: string;
        'user-agent': string;
        origin: string;
    };
    radio: string;
}
