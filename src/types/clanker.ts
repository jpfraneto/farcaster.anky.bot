export interface Token {
  // Basic token information
  address: string;
  name: string;
  symbol: string;
  decimals: number;

  // Deployment information
  deployer_fid: number;
  deployer_username: string;
  deployment_cast_hash: string;
  deployment_timestamp: number;

  // Token metrics
  total_supply: string;
  price_usd?: number;
  liquidity_usd?: number;

  // Media
  image_url?: string;

  // Additional metadata
  is_verified?: boolean;
  notifications_sent?: number;
  last_updated?: number;
  is_token_deployed_on_wow?: boolean;
}
