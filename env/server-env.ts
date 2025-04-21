import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
  .object({
    SECRET: z.string({
      required_error: "SECRET is required",
    }),
    ALCHEMY_API_KEY: z.string({
      required_error: "ALCHEMY_API_KEY is required",
    }),
    DUNE_API_KEY: z.string({
      required_error: "DUNE_API_KEY is required",
    }),
    DISCORD_WEBHOOK: z.string({
      required_error: "DISCORD_WEBHOOK is required",
    }),
    FARCASTER_DEVELOPER_FID: z.string({
      required_error: "FARCASTER_DEVELOPER_FID is required",
    }),
    FARCASTER_UUID: z.string({
      required_error: "FARCASTER_UUID is required",
    }),
    FARCASTER_PUBLIC_KEY: z.string({
      required_error: "FARCASTER_PUBLIC_KEY is required",
    }),
    FARCASTER_DEVELOPER_MNEMONIC: z.string({
      required_error: "FARCASTER_DEVELOPER_MNEMONIC is required",
    }),
    NEYNAR_API_KEY: z.string({
      required_error: "NEYNAR_API_KEY is required",
    }),
    AIRSTACK_API_KEY: z.string({
      required_error: "NEYNAR_API_KEY is required",
    }),
    OPENAI_API_KEY: z.string({
      required_error: "OPENAI_API_KEY is required",
    }),
    PINATA_API_JWT: z.string({
      required_error: "PINATA_API_JWT is required",
    }),
    FILEBASE_API_KEY: z.string({
      required_error: "FILEBASE_API_KEY is required",
    }),
    MY_SIGNER: z.string({
      required_error: "MY_SIGNER is required",
    }),
    AD_PRIVATE_KEY: z.string({
      required_error: "AD_PRIVATE_KEY is required",
    }),
  })
  .strict();

export const {
  AIRSTACK_API_KEY,
  SECRET,
  ALCHEMY_API_KEY,
  DUNE_API_KEY,
  DISCORD_WEBHOOK,
  FARCASTER_PUBLIC_KEY,
  FARCASTER_UUID,
  FARCASTER_DEVELOPER_FID,
  FARCASTER_DEVELOPER_MNEMONIC,
  FILEBASE_API_KEY,
  OPENAI_API_KEY,
  PINATA_API_JWT,
  NEYNAR_API_KEY,
  MY_SIGNER,
  AD_PRIVATE_KEY,
} = envSchema.parse(process.env);
