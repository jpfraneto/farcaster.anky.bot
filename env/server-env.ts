import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  SECRET: z.string({
    required_error: "SECRET is required",
  }),
  ALCHEMY_API_KEY: z.string({
    required_error: "ALCHEMY_API_KEY is required",
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
  NEYNAR_CLIENT_ID: z.string({
    required_error: "NEYNAR_CLIENT_ID is required",
  }),
  OPENAI_API_KEY: z.string({
    required_error: "OPENAI_API_KEY is required",
  }),
  PINATA_API_JWT: z.string({
    required_error: "PINATA_API_JWT is required",
  }),
  DATABASE_URL: z.string({
    required_error: "DATABASE_URL is required",
  }),
  DUNE_API_KEY: z.string({
    required_error: "DUNE_API_KEY is required",
  }),
  BASESCAN_API_KEY: z.string({
    required_error: "BASESCAN_API_KEY is required",
  }),
  MY_SIGNER: z.string({
    required_error: "MY_SIGNER is required",
  }),
  FILEBASE_API_KEY: z.string({
    required_error: "FILEBASE_API_KEY is required",
  }),
  PORT: z.string({
    required_error: "PORT is required",
  }),
  FRONTEND_API_KEY: z.string({
    required_error: "FRONTEND_API_KEY is required",
  }),
  API_KEY: z.string({
    required_error: "API_KEY is required",
  }),
  OPENROUTER_API_KEY: z.string({
    required_error: "OPENROUTER_API_KEY is required",
  }),
  GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC: z.string({
    required_error: "GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC is required",
  }),
  GRASSCASTER_SIGNER_UUID: z.string({
    required_error: "GRASSCASTER_SIGNER_UUID is required",
  }),
});
export const {
  SECRET,
  ALCHEMY_API_KEY,
  DISCORD_WEBHOOK,
  FARCASTER_PUBLIC_KEY,
  FARCASTER_UUID,
  FARCASTER_DEVELOPER_FID,
  FARCASTER_DEVELOPER_MNEMONIC,
  OPENAI_API_KEY,
  PINATA_API_JWT,
  NEYNAR_API_KEY,
  NEYNAR_CLIENT_ID,
  DATABASE_URL,
  DUNE_API_KEY,
  BASESCAN_API_KEY,
  MY_SIGNER,
  FILEBASE_API_KEY,
  PORT,
  FRONTEND_API_KEY,
  API_KEY,
  OPENROUTER_API_KEY,
  GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC,
  GRASSCASTER_SIGNER_UUID,
} = envSchema.parse(process.env);
