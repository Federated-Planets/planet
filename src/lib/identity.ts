import { CryptoCore } from "./crypto";

export class PlanetIdentity {
  /**
   * Retrieves or generates the planet's Ed25519 identity keys from KV.
   */
  static async getIdentity(KV: KVNamespace): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    publicKeyBase64: string;
  }> {
    const existingPublic = await KV.get("identity_public");
    const existingPrivate = await KV.get("identity_private");

    if (existingPublic && existingPrivate) {
      const publicKey = await CryptoCore.importKey(existingPublic, "public");
      const privateKey = await CryptoCore.importKey(existingPrivate, "private");
      return { publicKey, privateKey, publicKeyBase64: existingPublic };
    }

    // Generate new if not found
    const keyPair = await CryptoCore.generateKeyPair();
    const publicB64 = await CryptoCore.exportKey(keyPair.publicKey);
    const privateB64 = await CryptoCore.exportKey(keyPair.privateKey);

    await KV.put("identity_public", publicB64);
    await KV.put("identity_private", privateB64);

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64: publicB64,
    };
  }
}
