import { CryptoCore } from "./crypto";
import { doGetIdentity, doSetIdentity } from "./do-storage";

export class PlanetIdentity {
  /**
   * Retrieves or generates the planet's Ed25519 identity keys from DO storage.
   */
  static async getIdentity(TRAFFIC_CONTROL: DurableObjectNamespace): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    publicKeyBase64: string;
  }> {
    const result = await doGetIdentity(TRAFFIC_CONTROL);

    if (result.public && result.private) {
      const publicKey = await CryptoCore.importKey(result.public, "public");
      const privateKey = await CryptoCore.importKey(result.private, "private");
      return { publicKey, privateKey, publicKeyBase64: result.public };
    }

    // Generate new if not found
    const keyPair = await CryptoCore.generateKeyPair();
    const publicB64 = await CryptoCore.exportKey(keyPair.publicKey);
    const privateB64 = await CryptoCore.exportKey(keyPair.privateKey);

    await doSetIdentity(TRAFFIC_CONTROL, publicB64, privateB64);

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyBase64: publicB64,
    };
  }
}
