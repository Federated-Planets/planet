/**
 * Cryptography Utility for Space Travel Protocol
 * Uses Web Crypto API (Ed25519) for signing and verification.
 */

export class CryptoCore {
  private static KEY_ALGO = {
    name: "Ed25519",
  };

  /**
   * Generates a new Ed25519 KeyPair
   */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return (await crypto.subtle.generateKey(
      this.KEY_ALGO,
      true,
      ["sign", "verify"]
    )) as CryptoKeyPair;
  }

  /**
   * Exports a key to Base64 format
   */
  static async exportKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey(
      key.type === "public" ? "spki" : "pkcs8",
      key
    );
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  /**
   * Imports a key from Base64 format
   */
  static async importKey(base64Key: string, type: "public" | "private"): Promise<CryptoKey> {
    const binary = atob(base64Key);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
      type === "public" ? "spki" : "pkcs8",
      bytes,
      this.KEY_ALGO,
      true,
      type === "public" ? ["verify"] : ["sign"]
    );
  }

  /**
   * Signs data string using a private key
   */
  static async sign(data: string, privateKey: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      this.KEY_ALGO,
      privateKey,
      encoder.encode(data)
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Verifies signature for data string using a public key
   */
  static async verify(data: string, signatureBase64: string, publicKey: CryptoKey): Promise<boolean> {
    const encoder = new TextEncoder();
    const signatureBinary = atob(signatureBase64);
    const signatureBytes = new Uint8Array(signatureBinary.length);
    for (let i = 0; i < signatureBinary.length; i++) {
      signatureBytes[i] = signatureBinary.charCodeAt(i);
    }

    return await crypto.subtle.verify(
      this.KEY_ALGO,
      publicKey,
      signatureBytes,
      encoder.encode(data)
    );
  }
}
