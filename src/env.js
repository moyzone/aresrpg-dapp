const {
  VITE_DISCORD_CLIENT_ID,
  VITE_DISCORD_REDIRECT_URI = 'http://localhost:3000/discord-oauth',
  VITE_SERVER_URL = 'http://localhost:3001',
  VITE_ARESRPG_PACKAGE_TESTNET_UPGRADED = '0xc583422515e2f0bde68edd92dfd54fbff0b6045147dc6bc5f8d9a75720b6f987',
  VITE_ARESRPG_PACKAGE_TESTNET_ORIGINAL = '0x6e3003b433e1e2cbad6471c0e7caf5c6a50cc44cca3d176885a9272149392592',
  VITE_ARESRPG_PACKAGE_MAINNET_UPGRADED = '',
  VITE_ARESRPG_PACKAGE_MAINNET_ORIGINAL = '',
  VITE_ENABLE_TERRAIN_EDITOR: enable_terrain_editor = 'false',
  VITE_USE_ANKR: vite_use_ankr = 'false',
} = import.meta.env

export const VITE_ENABLE_TERRAIN_EDITOR = enable_terrain_editor === 'true'
export const VITE_USE_ANKR = vite_use_ankr === 'true'

export {
  VITE_SERVER_URL,
  VITE_DISCORD_CLIENT_ID,
  VITE_DISCORD_REDIRECT_URI,
  VITE_ARESRPG_PACKAGE_TESTNET_ORIGINAL,
  VITE_ARESRPG_PACKAGE_TESTNET_UPGRADED,
  VITE_ARESRPG_PACKAGE_MAINNET_ORIGINAL,
  VITE_ARESRPG_PACKAGE_MAINNET_UPGRADED,
}
