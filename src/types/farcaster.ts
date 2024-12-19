// types/farcaster.d.ts
import { z } from "zod";

export interface SendNotificationRequest {
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
  tokens: string[];
}

export interface FrameNotificationDetails {
  notificationId?: string;
  title?: string;
  body?: string;
  targetUrl?: string;
  tokens?: string[];
  url: string;
  token: string;
}

// Create the Zod schema
export const sendNotificationResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({
    successfulTokens: z.array(z.string()),
    failedTokens: z.array(z.string()),
    rateLimitedTokens: z.array(z.string()),
  }),
});

// Infer the type from the schema
export type SendNotificationResponse = z.infer<
  typeof sendNotificationResponseSchema
>;

export interface VerifiedAddress {
  eth_addresses?: string[];
  sol_addresses?: string[];
}

export interface VerifiedAccount {
  platform: string;
  username: string;
}

export interface Profile {
  bio?: {
    text: string;
  };
}

export interface Author {
  object: string;
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  custody_address: string;
  profile: Profile;
  follower_count: number;
  following_count: number;
  verifications: string[];
  verified_addresses: VerifiedAddress;
  verified_accounts: VerifiedAccount[];
  power_badge: boolean;
  viewer_context: {
    following: boolean;
    followed_by: boolean;
    blocking: boolean;
    blocked_by: boolean;
  };
}

export interface Channel {
  object: string;
  id: string;
  name: string;
  image_url: string;
  viewer_context: {
    following: boolean;
  };
}

export interface Reaction {
  fid: number;
  fname: string;
}

export interface Cast {
  object: string;
  hash: string;
  author: Author;
  thread_hash: string;
  parent_hash: string | null;
  parent_url: string | null;
  root_parent_url: string | null;
  parent_author: {
    fid: number | null;
  };
  text: string;
  timestamp: string;
  embeds: Array<{
    url: string;
    metadata?: {
      content_type: string | null;
      content_length: number | null;
      _status: string;
    };
  }>;
  channel: Channel;
  reactions: {
    likes_count: number;
    recasts_count: number;
    likes: Reaction[];
    recasts: Reaction[];
  };
  replies: {
    count: number;
  };
  mentioned_profiles: any[];
  viewer_context: {
    liked: boolean;
    recasted: boolean;
  };
  author_channel_context: {
    following: boolean;
  };
}
