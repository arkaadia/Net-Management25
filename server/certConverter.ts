import type { Express, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

export interface OutputMissingRequirements {
  needsPrivateKey?: boolean;
  needsModulusMatch?: boolean;
  needsPassword?: boolean;
  errorMessageEn?: string;
  errorMessageFa?: string;
  instructionEn?: string;
  instructionFa?: string;
  commandExample?: string;
}

export interface ConvertedOutputItem {
  id: string;
  format: string;
  filename: string;
  mimeType: string;
  isBinary: boolean;
  text?: string;
  base64?: string;
  descriptionEn: string;
  descriptionFa: string;
  targetPlatforms: string[];
  sizeBytes: number;
  status?: 'ready' | 'requires_action' | 'error';
  missingRequirements?: OutputMissingRequirements;
}

export interface CertInfoMetadata {
  subject: string;
  commonName: string;
  issuer: string;
  issuerOrg: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number | null;
  isExpired: boolean;
  serialNumber: string;
  sha256Fingerprint: string;
  sha1Fingerprint: string;
  keyType: string;
  keyBits: number | null;
  sans: string[];
}

export interface KeyMatchResult {
  checked: boolean;
  matches: boolean;
  certModulusHash?: string;
  keyModulusHash?: string;
  messageEn?: string;
  messageFa?: string;
}

export interface ExtractedPemsResult {
  certPem: string;
  keyPem: string;
  caBundlePem: string;
  isCombinedFound: boolean;
  notes: string[];
}

function cleanString(str: any): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-') // Normalize all Unicode dashes to ASCII -
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function extractCertBlocks(str: string, notes?: string[]): string[] {
  const certs: string[] = [];
  if (!str) return certs;

  // Matches any certificate block variation: CERTIFICATE, SERVER CERTIFICATE, SSL CERTIFICATE,
  // X509 CERTIFICATE, X.509 CERTIFICATE, TRUSTED CERTIFICATE, PKCS7, etc.
  // Handles arbitrary dashes, tildes, spaces, and does not mandate newlines before/after headers.
  const certRegex = /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509))[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509)[-~=_\s]*/gi;
  let match: RegExpExecArray | null;
  while ((match = certRegex.exec(str)) !== null) {
    const tag = match[1].trim().toUpperCase();
    const body = match[2];

    // If it is a PKCS#7 / P7B bundle, unpack individual certificates inside it using OpenSSL CLI
    if (tag.includes('PKCS')) {
      try {
        const tmpFile = path.join(os.tmpdir(), `ssl-p7-${Date.now()}-${Math.random().toString(36).slice(2)}.p7b`);
        fs.writeFileSync(tmpFile, match[0], 'utf8');
        const p7out = execSync(`openssl pkcs7 -print_certs -in "${tmpFile}" 2>/dev/null`).toString();
        try { fs.unlinkSync(tmpFile); } catch {}
        const unpacked = extractCertBlocks(p7out, notes);
        if (unpacked.length > 0) {
          certs.push(...unpacked);
          if (notes) notes.push(`Unpacked ${unpacked.length} certificate(s) from PKCS#7 bundle.`);
          continue;
        }
      } catch {}
    }

    // Robust Base64 extraction: Filter out attribute lines (Bag Attributes, subject=, issuer=, colons, etc.)
    const rawLines = body.split(/[\r\n]+/);
    const validBase64Lines: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip metadata headers and comments
      if (
        trimmed.includes(' ') ||
        trimmed.includes('\t') ||
        trimmed.includes(':') ||
        trimmed.startsWith('Bag Attributes') ||
        trimmed.startsWith('subject=') ||
        trimmed.startsWith('issuer=') ||
        trimmed.startsWith('-----')
      ) {
        continue;
      }
      if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
        validBase64Lines.push(trimmed);
      }
    }

    let b64 = validBase64Lines.join('');
    if (!b64) {
      // Fallback: strip non-base64 characters
      const rawFiltered = body.replace(/[^A-Za-z0-9+/=]/g, '');
      if (rawFiltered.length > 50) {
        b64 = rawFiltered;
      }
    }

    // Ensure valid Base64 padding
    if (b64.length % 4 !== 0) {
      b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    }

    if (b64.length > 40) {
      // If it decodes to ASN.1 Sequence (0x30), extract the exact valid DER slice to eliminate corrupt trailing bytes
      try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 50 && buf[0] === 0x30) {
          let derLen = buf.length;
          if (buf[1] === 0x82 && buf.length >= 4) {
            derLen = 4 + ((buf[2] << 8) | buf[3]);
          } else if (buf[1] === 0x81 && buf.length >= 3) {
            derLen = 3 + buf[2];
          } else if (buf[1] < 0x80) {
            derLen = 2 + buf[1];
          }
          if (buf.length >= derLen) {
            b64 = buf.slice(0, derLen).toString('base64');
          }
        }
      } catch {}

      const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;
      certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
    }
  }
  return certs;
}

function extractKeyBlocks(str: string): string[] {
  const keys: string[] = [];
  if (!str) return keys;
  // Matches any private key block: RSA PRIVATE KEY, EC PRIVATE KEY, OPENSSH PRIVATE KEY, ENCRYPTED, etc.
  const keyRegex = /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*PRIVATE\s+KEY)[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi;
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(str)) !== null) {
    let header = match[1].trim().toUpperCase();
    if (!header.includes('KEY')) header = `${header} PRIVATE KEY`;
    const body = match[2];

    // Extract valid base64 lines, preserving encrypted key headers (Proc-Type, DEK-Info) if present
    const rawLines = body.split(/[\r\n]+/);
    const validLines: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('Proc-Type:') || trimmed.startsWith('DEK-Info:')) {
        validLines.push(trimmed);
        continue;
      }
      if (
        trimmed.includes(' ') ||
        trimmed.includes('\t') ||
        trimmed.startsWith('Bag Attributes') ||
        trimmed.startsWith('subject=') ||
        trimmed.startsWith('issuer=') ||
        trimmed.startsWith('-----')
      ) {
        continue;
      }
      if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
        validLines.push(trimmed);
      }
    }

    let content = validLines.join('\n');
    if (!content) {
      const rawFiltered = body.replace(/[^A-Za-z0-9+/=]/g, '');
      if (rawFiltered.length > 40) {
        content = rawFiltered.match(/.{1,64}/g)?.join('\n') || rawFiltered;
      }
    }

    if (content) {
      keys.push(`-----BEGIN ${header}-----\n${content}\n-----END ${header}-----`);
    }
  }
  return keys;
}

function tryParseRawDerOrBase64(str: string): string[] {
  if (!str) return [];
  const certs: string[] = [];

  // Strip private keys so their base64 doesn't interfere
  const textWithoutKeys = str.replace(/[-~=_\s]*BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[\s\S]*?END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi, '');

  // Look for MII-prefixed base64 streams (all X.509 ASN.1 sequences > 256 bytes encode to MII in base64)
  const strippedWhitespace = textWithoutKeys.replace(/[\r\n\s]/g, '');
  const miiRegex = /(MII[A-Za-z0-9+/=]{80,})/g;
  let m: RegExpExecArray | null;
  while ((m = miiRegex.exec(strippedWhitespace)) !== null) {
    let candidate = m[1];
    if (candidate.length % 4 !== 0) {
      candidate += '='.repeat((4 - (candidate.length % 4)) % 4);
    }
    try {
      const buf = Buffer.from(candidate, 'base64');
      if (buf.length > 80 && buf[0] === 0x30) {
        let derLen = buf.length;
        if (buf[1] === 0x82 && buf.length >= 4) {
          derLen = 4 + ((buf[2] << 8) | buf[3]);
        } else if (buf[1] === 0x81 && buf.length >= 3) {
          derLen = 3 + buf[2];
        }
        const cleanDer = buf.slice(0, derLen);
        const cleanB64 = cleanDer.toString('base64');
        const chunked = cleanB64.match(/.{1,64}/g)?.join('\n') || cleanB64;
        certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
      }
    } catch {}
  }

  if (certs.length > 0) return certs;

  // Filter out standard metadata lines (Bag Attributes, subject=, etc.) and inspect raw base64
  const lines = textWithoutKeys.split(/[\r\n]+/);
  const filtered = lines.filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (
      trimmed.includes(' ') ||
      trimmed.includes('\t') ||
      trimmed.includes(':') ||
      trimmed.startsWith('Bag Attributes') ||
      trimmed.startsWith('subject=') ||
      trimmed.startsWith('issuer=') ||
      trimmed.startsWith('Certificate:') ||
      trimmed.startsWith('Data:') ||
      /^[-~=_ ]*(BEGIN|END)[-~=_ ]*/i.test(trimmed)
    ) {
      return false;
    }
    return /^[A-Za-z0-9+/=]+$/.test(trimmed);
  });

  let cleanB64 = filtered.join('');
  if (cleanB64.length > 80) {
    if (cleanB64.length % 4 !== 0) {
      cleanB64 += '='.repeat((4 - (cleanB64.length % 4)) % 4);
    }
    try {
      const buf = Buffer.from(cleanB64, 'base64');
      if (buf.length > 50 && buf[0] === 0x30) {
        let derLen = buf.length;
        if (buf[1] === 0x82 && buf.length >= 4) {
          derLen = 4 + ((buf[2] << 8) | buf[3]);
        } else if (buf[1] === 0x81 && buf.length >= 3) {
          derLen = 3 + buf[2];
        }
        const cleanDer = buf.slice(0, derLen);
        const cleanB64Final = cleanDer.toString('base64');
        const chunked = cleanB64Final.match(/.{1,64}/g)?.join('\n') || cleanB64Final;
        certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
      }
    } catch {}
  }

  return certs;
}

function extractWithOpenSslCli(rawText: string): string[] {
  if (!rawText || rawText.length < 50) return [];
  try {
    const tmpFile = path.join(os.tmpdir(), `ssl-detect-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(tmpFile, rawText, 'utf8');
    try {
      // 1. Try x509 direct load
      const out = execSync(`openssl x509 -in "${tmpFile}" 2>/dev/null`).toString();
      if (out && out.includes('BEGIN CERTIFICATE')) {
        fs.unlinkSync(tmpFile);
        return [out.trim()];
      }
    } catch {}

    try {
      // 2. Try pkcs7 unpack
      const p7out = execSync(`openssl pkcs7 -print_certs -in "${tmpFile}" 2>/dev/null`).toString();
      const matches = p7out.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (matches && matches.length > 0) {
        fs.unlinkSync(tmpFile);
        return matches;
      }
    } catch {}

    try { fs.unlinkSync(tmpFile); } catch {}
  } catch {}
  return [];
}

/**
 * Normalizes PEM strings, removes Unicode dashes, strips BOM, fixes line endings,
 * and smartly extracts certificates, private keys, and CA bundles from single or combined inputs.
 */
export function normalizeAndExtractPems(
  certInput?: string,
  keyInput?: string,
  caInput?: string
): ExtractedPemsResult {
  const notes: string[] = [];

  const rawCert = cleanString(certInput);
  const rawKey = cleanString(keyInput);
  const rawCa = cleanString(caInput);

  let foundCerts = extractCertBlocks(rawCert, notes);
  let foundKeys = extractKeyBlocks(rawKey);
  let isCombined = false;

  // Check if rawCert actually contained private key(s)
  const keysInCertField = extractKeyBlocks(rawCert);
  if (keysInCertField.length > 0) {
    isCombined = true;
    notes.push('Found private key inside public certificate input.');
    if (foundKeys.length === 0) {
      foundKeys = keysInCertField;
    }
    // Also remove the keys and retry finding certs in leftover text if foundCerts is empty
    if (foundCerts.length === 0) {
      const textNoKeys = rawCert.replace(
        /[-~=_\s]*BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[\s\S]*?END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi,
        ''
      );
      foundCerts = extractCertBlocks(textNoKeys);
    }
  }

  // Check if rawKey actually contained certificate(s)
  const certsInKeyField = extractCertBlocks(rawKey);
  if (certsInKeyField.length > 0) {
    notes.push('Found certificate inside private key input.');
    if (foundCerts.length === 0) {
      foundCerts = certsInKeyField;
    }
  }

  // Extract from CA field as well
  const caCerts = extractCertBlocks(rawCa);

  // If no cert found with standard regex headers, try raw base64 or ASN.1 DER stream
  if (foundCerts.length === 0) {
    const rawParsed = tryParseRawDerOrBase64(rawCert);
    if (rawParsed.length > 0) {
      foundCerts.push(...rawParsed);
      notes.push('Reconstructed standard PEM from raw Base64 / ASN.1 stream.');
    }
  }

  // If still no cert found, invoke OpenSSL CLI as authoritative fallback
  if (foundCerts.length === 0) {
    const openSslCerts = extractWithOpenSslCli(rawCert);
    if (openSslCerts.length > 0) {
      foundCerts.push(...openSslCerts);
      notes.push('Extracted certificate via OpenSSL CLI engine.');
    }
  }

  const primaryCert = foundCerts[0] || '';
  const remainingCerts = foundCerts.slice(1);
  const allCaList = [...remainingCerts, ...caCerts];
  const primaryKey = foundKeys[0] || '';

  return {
    certPem: primaryCert,
    keyPem: primaryKey,
    caBundlePem: allCaList.join('\n\n'),
    isCombinedFound: isCombined,
    notes,
  };
}

/**
 * Parses X.509 certificate metadata using Node.js crypto.X509Certificate with automatic OpenSSL CLI fallback
 */
function parseCertificateDetails(certPem: string, fallbackDir?: string): CertInfoMetadata {
  // First ensure we have clean PEM syntax
  let cleanPem = certPem.trim();
  const certBlocks = extractCertBlocks(cleanPem);
  if (certBlocks.length > 0) {
    cleanPem = certBlocks[0];
  } else {
    const rawBlocks = tryParseRawDerOrBase64(cleanPem);
    if (rawBlocks.length > 0) {
      cleanPem = rawBlocks[0];
    }
  }

  try {
    const x509 = new crypto.X509Certificate(cleanPem);
    const now = new Date();
    const validToDate = new Date(x509.validTo);
    const validFromDate = new Date(x509.validFrom);
    const diffMs = validToDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining <= 0;

    // Extract SANs
    const sans: string[] = [];
    if (x509.subjectAltName) {
      const parts = x509.subjectAltName.split(',').map((p) => p.trim());
      for (const p of parts) {
        if (p.startsWith('DNS:') || p.startsWith('IP Address:')) {
          sans.push(p.replace(/^(DNS:|IP Address:)/, '').trim());
        } else {
          sans.push(p);
        }
      }
    }

    // Extract CN and Issuer Org
    const subject = x509.subject;
    const issuer = x509.issuer;
    const cnMatch = subject.match(/CN=([^,\n/]+)/i);
    const commonName = cnMatch ? cnMatch[1].trim() : subject;
    const orgMatch = issuer.match(/O=([^,\n/]+)/i);
    const issuerOrg = orgMatch ? orgMatch[1].trim() : issuer;

    // Key details
    const keyDetails = x509.publicKey.asymmetricKeyDetails;
    const keyType = x509.publicKey.asymmetricKeyType?.toUpperCase() || 'RSA';
    const keyBits = keyDetails?.modulusLength || 2048;

    return {
      subject,
      commonName,
      issuer,
      issuerOrg,
      validFrom: validFromDate.toISOString().replace('T', ' ').substring(0, 19),
      validTo: validToDate.toISOString().replace('T', ' ').substring(0, 19),
      daysRemaining: isExpired ? 0 : daysRemaining,
      isExpired,
      serialNumber: x509.serialNumber,
      sha256Fingerprint: x509.fingerprint256,
      sha1Fingerprint: x509.fingerprint,
      keyType,
      keyBits,
      sans,
    };
  } catch (nodeErr: any) {
    // Resilient fallback using standard OpenSSL CLI
    let tempDirCreated = false;
    let dir = fallbackDir;
    if (!dir) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-parse-'));
      tempDirCreated = true;
    }

    try {
      const certFile = path.join(dir, 'fallback_cert.pem');
      fs.writeFileSync(certFile, cleanPem, 'utf8');

      // Test whether standard openssl x509 works on this file
      let useDer = false;
      let textRaw = '';
      try {
        textRaw = execSync(`openssl x509 -in "${certFile}" -noout -text 2>/dev/null`).toString();
      } catch {
        // If x509 fails, check if it's PKCS#7 bundle
        try {
          const p7print = execSync(`openssl pkcs7 -print_certs -in "${certFile}" 2>/dev/null`).toString();
          const p7blocks = extractCertBlocks(p7print);
          if (p7blocks.length > 0) {
            cleanPem = p7blocks[0];
            fs.writeFileSync(certFile, cleanPem, 'utf8');
            textRaw = execSync(`openssl x509 -in "${certFile}" -noout -text 2>/dev/null`).toString();
          }
        } catch {
          // If still fails, check if it's binary DER
          try {
            textRaw = execSync(`openssl x509 -in "${certFile}" -inform DER -noout -text 2>/dev/null`).toString();
            useDer = true;
          } catch {}
        }
      }

      if (!textRaw) {
        throw new Error('Please ensure certificate contains valid PEM base64 or DER structure.');
      }

      const informFlag = useDer ? '-inform DER' : '';
      const subjectRaw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -subject 2>/dev/null`).toString().trim();
      const issuerRaw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -issuer 2>/dev/null`).toString().trim();
      const datesRaw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -dates 2>/dev/null`).toString().trim();
      const serialRaw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -serial 2>/dev/null`).toString().trim();
      const fp256Raw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -fingerprint -sha256 2>/dev/null`).toString().trim();
      const fp1Raw = execSync(`openssl x509 -in "${certFile}" ${informFlag} -noout -fingerprint -sha1 2>/dev/null`).toString().trim();

      const subject = subjectRaw.replace(/^subject=\s*/i, '');
      const issuer = issuerRaw.replace(/^issuer=\s*/i, '');
      const cnMatch = subject.match(/CN\s*=\s*([^,\n/]+)/i);
      const commonName = cnMatch ? cnMatch[1].trim() : subject;
      const orgMatch = issuer.match(/O\s*=\s*([^,\n/]+)/i);
      const issuerOrg = orgMatch ? orgMatch[1].trim() : issuer;

      const notBeforeMatch = datesRaw.match(/notBefore=(.*)/i);
      const notAfterMatch = datesRaw.match(/notAfter=(.*)/i);
      const validFromDate = notBeforeMatch ? new Date(notBeforeMatch[1].trim()) : new Date();
      const validToDate = notAfterMatch ? new Date(notAfterMatch[1].trim()) : new Date();

      const now = new Date();
      const diffMs = validToDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining <= 0;

      const serial = serialRaw.replace(/^serial=\s*/i, '');
      const sha256 = fp256Raw.replace(/.*=\s*/i, '');
      const sha1 = fp1Raw.replace(/.*=\s*/i, '');

      // SANs from text
      const sans: string[] = [];
      const sanMatch = textRaw.match(/X509v3 Subject Alternative Name:[^\n]*\n\s*([^\n]+)/i);
      if (sanMatch && sanMatch[1]) {
        const parts = sanMatch[1].split(',').map((s) => s.trim().replace(/^(DNS:|IP Address:)/i, ''));
        sans.push(...parts);
      }

      // Key details from text
      let keyType = 'RSA';
      let keyBits = 2048;
      if (textRaw.includes('Public Key Algorithm: id-ecPublicKey')) {
        keyType = 'EC';
      }
      const bitsMatch = textRaw.match(/Public-Key:\s*\((\d+)\s*bit\)/i);
      if (bitsMatch) {
        keyBits = parseInt(bitsMatch[1], 10);
      }

      return {
        subject,
        commonName,
        issuer,
        issuerOrg,
        validFrom: validFromDate.toISOString().replace('T', ' ').substring(0, 19),
        validTo: validToDate.toISOString().replace('T', ' ').substring(0, 19),
        daysRemaining: isExpired ? 0 : daysRemaining,
        isExpired,
        serialNumber: serial,
        sha256Fingerprint: sha256,
        sha1Fingerprint: sha1,
        keyType,
        keyBits,
        sans,
      };
    } catch (cliErr: any) {
      throw new Error(`Failed to parse certificate syntax: ${cliErr.message || nodeErr.message}`);
    } finally {
      if (tempDirCreated && dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  }
}

/**
 * Verifies if private key matches public certificate using OpenSSL modulus and public key hashing
 */
function verifyKeyModulusMatch(certPath: string, keyPath: string): KeyMatchResult {
  try {
    // Attempt standard RSA modulus comparison
    let certMod = '';
    let keyMod = '';
    try {
      certMod = execSync(`openssl x509 -noout -modulus -in "${certPath}" 2>/dev/null`).toString().trim();
      keyMod = execSync(`openssl rsa -noout -modulus -in "${keyPath}" 2>/dev/null`).toString().trim();
    } catch {}

    if (!certMod || !keyMod) {
      // Fallback for EC, Ed25519 or PKCS#8 keys using public key SHA-256 hash comparison
      try {
        const certPubHash = execSync(
          `openssl x509 -in "${certPath}" -noout -pubkey | openssl sha256 2>/dev/null`
        )
          .toString()
          .trim();
        const keyPubHash = execSync(
          `openssl pkey -in "${keyPath}" -pubout | openssl sha256 2>/dev/null`
        )
          .toString()
          .trim();

        const matches = certPubHash === keyPubHash && Boolean(certPubHash);
        return {
          checked: true,
          matches,
          certModulusHash: certPubHash.replace(/.*= /, ''),
          keyModulusHash: keyPubHash.replace(/.*= /, ''),
          messageEn: matches
            ? 'Public certificate matches private key (Verified via Public Key Hash).'
            : 'Warning: Private key does NOT match the public certificate!',
          messageFa: matches
            ? 'گواهی عمومی دقیقاً با کلید خصوصی مطابقت دارد (تأییدشده از طریق هش کلید عمومی).'
            : 'هشدار: کلید خصوصی ارائه‌شده با این گواهی عمومی مطابقت ندارد!',
        };
      } catch (pubErr: any) {
        return {
          checked: true,
          matches: false,
          messageEn: `Key verification check could not be completed: ${pubErr.message}`,
          messageFa: `بررسی تطابق کلید با خطا مواجه شد: ${pubErr.message}`,
        };
      }
    }

    const certHash = crypto.createHash('md5').update(certMod).digest('hex');
    const keyHash = crypto.createHash('md5').update(keyMod).digest('hex');
    const matches = certHash === keyHash;

    return {
      checked: true,
      matches,
      certModulusHash: certHash,
      keyModulusHash: keyHash,
      messageEn: matches
        ? 'Public certificate matches private key (Verified via Modulus MD5).'
        : 'Warning: Private key does NOT match the public certificate!',
      messageFa: matches
        ? 'گواهی عمومی دقیقاً با کلید خصوصی مطابقت دارد (تأییدشده با هش ماژولوس MD5).'
        : 'هشدار: کلید خصوصی ارائه‌شده با این گواهی عمومی مطابقت ندارد!',
    };
  } catch (err: any) {
    return {
      checked: true,
      matches: false,
      messageEn: `Key verification check failed: ${err.message}`,
      messageFa: `بررسی تطابق کلید با خطا مواجه شد: ${err.message}`,
    };
  }
}

export function registerCertConverterRoutes(app: Express): void {
  /**
   * Main Conversion API: Converts certificates and keys into all target formats
   */
  app.post('/api/tools/cert-convert', async (req: Request, res: Response) => {
    let tmpDir = '';
    try {
      const certRaw = req.body?.certText || req.body?.certPem || req.body?.certificate || req.body?.cert;
      const keyRaw = req.body?.keyText || req.body?.keyPem || req.body?.privateKey || req.body?.key;
      const caRaw = req.body?.caBundleText || req.body?.caBundlePem || req.body?.caText || req.body?.ca;
      const pfxPassword = req.body?.pfxPassword ?? req.body?.password;
      const friendlyName = req.body?.friendlyName ?? req.body?.alias;

      // Normalize and extract all components seamlessly
      const extracted = normalizeAndExtractPems(certRaw, keyRaw, caRaw);
      const { certPem, keyPem, caBundlePem, isCombinedFound, notes } = extracted;

      if (!certPem) {
        return res.status(400).json({
          success: false,
          error:
            'Could not find a valid SSL/TLS certificate. Please ensure your input contains a valid certificate text (e.g. -----BEGIN CERTIFICATE-----) or upload a valid certificate file.',
        });
      }

      const pfxPass = pfxPassword !== undefined ? String(pfxPassword) : '';
      const safeAlias = (friendlyName || '').trim();

      // Create isolated temporary workspace
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-conv-'));
      const certPath = path.join(tmpDir, 'cert.pem');
      const keyPath = path.join(tmpDir, 'key.pem');
      const caPath = path.join(tmpDir, 'ca.pem');

      fs.writeFileSync(certPath, certPem, 'utf8');

      // Parse metadata with fallback to OpenSSL CLI
      const certInfo = parseCertificateDetails(certPem, tmpDir);
      const safeCn = (certInfo.commonName || 'certificate')
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/^\*\_?/, 'wildcard_');
      const alias = safeAlias || certInfo.commonName || 'ssl_cert';

      // Check if CA bundle is available
      const hasCa = Boolean(caBundlePem && caBundlePem.includes('-----BEGIN CERTIFICATE-----'));
      if (hasCa) {
        fs.writeFileSync(caPath, caBundlePem, 'utf8');
      }

      // Check if Private Key is available
      const hasKey = Boolean(keyPem && (keyPem.includes('KEY-----') || keyPem.length > 50));
      if (hasKey) {
        fs.writeFileSync(keyPath, keyPem, 'utf8');
      }

      // Key matching validation
      let keyMatch: KeyMatchResult = { checked: false, matches: false };
      if (hasKey) {
        keyMatch = verifyKeyModulusMatch(certPath, keyPath);
      }

      const outputs: ConvertedOutputItem[] = [];

      // 1. Standard PEM Certificate (.crt / .pem)
      outputs.push({
        id: 'pem_crt',
        format: 'PEM Certificate (.crt)',
        filename: `${safeCn}.crt`,
        mimeType: 'application/x-x509-ca-cert',
        isBinary: false,
        text: certPem,
        descriptionEn: 'Standard Base64 ASCII format with BEGIN/END headers. Default for Nginx, Apache, HAProxy, Linux servers.',
        descriptionFa: 'فرمت استاندارد متنی Base64 با هدرهای استاندارد. مناسب برای وب‌سرورهای Nginx، Apache، HAProxy و سرورهای لینوکس.',
        targetPlatforms: ['Nginx', 'Apache HTTPD', 'HAProxy', 'Linux / Unix', 'cPanel / DirectAdmin'],
        sizeBytes: Buffer.byteLength(certPem, 'utf8'),
        status: 'ready',
      });

      // 2. PKCS#12 / PFX Archive (.pfx / .p12) - Always present in output formats
      if (hasKey) {
        let pfxSuccess = false;
        let pfxBuffer: Buffer | null = null;
        const pfxPath = path.join(tmpDir, 'output.pfx');
        const passOpt = pfxPass ? `-passout "pass:${pfxPass}"` : `-passout "pass:"`;
        const caOpt = hasCa ? `-certfile "${caPath}"` : '';
        const nameOpt = alias ? `-name "${alias}"` : '';

        try {
          execSync(
            `openssl pkcs12 -export -out "${pfxPath}" -inkey "${keyPath}" -in "${certPath}" ${caOpt} ${nameOpt} ${passOpt} 2>/dev/null`
          );
          if (fs.existsSync(pfxPath)) {
            pfxBuffer = fs.readFileSync(pfxPath);
            pfxSuccess = true;
          }
        } catch {
          try {
            // Fallback attempt with -legacy flag for older environments
            execSync(
              `openssl pkcs12 -export -legacy -out "${pfxPath}" -inkey "${keyPath}" -in "${certPath}" ${caOpt} ${nameOpt} ${passOpt} 2>/dev/null`
            );
            if (fs.existsSync(pfxPath)) {
              pfxBuffer = fs.readFileSync(pfxPath);
              pfxSuccess = true;
            }
          } catch (pfxErr: any) {
            console.warn('[CertConverter] PFX export error:', pfxErr.message);
          }
        }

        if (pfxSuccess && pfxBuffer) {
          outputs.push({
            id: 'pkcs12_pfx',
            format: 'PKCS#12 Archive (.pfx / .p12)',
            filename: `${safeCn}.pfx`,
            mimeType: 'application/x-pkcs12',
            isBinary: true,
            base64: pfxBuffer.toString('base64'),
            status: 'ready',
            descriptionEn: `Encrypted password-protected container holding public certificate, private key, and intermediate chain. Mandatory for Microsoft IIS, Azure App Services, Windows Server, Tomcat. (Password: ${pfxPass ? 'Custom Password Set' : 'Blank/None'})`,
            descriptionFa: `کانتینر رمزشده حاوی گواهی عمومی، کلید خصوصی و زنجیره میانی. فرمت الزامی برای Microsoft IIS، سرویس‌های Azure و ویندوز سرور. (رمز عبور: ${pfxPass ? 'رمز سفارشی تنظیم شده' : 'بدون رمز'})`,
            targetPlatforms: ['Microsoft IIS', 'Azure App Services', 'Windows Server', 'Tomcat', 'Citrix Gateway'],
            sizeBytes: pfxBuffer.length,
          });
        } else {
          const isMismatch = keyMatch.checked && !keyMatch.matches;
          outputs.push({
            id: 'pkcs12_pfx',
            format: 'PKCS#12 Archive (.pfx / .p12)',
            filename: `${safeCn}.pfx`,
            mimeType: 'application/x-pkcs12',
            isBinary: true,
            sizeBytes: 0,
            status: 'requires_action',
            descriptionEn: 'Encrypted password-protected container holding public certificate, private key, and intermediate chain. Mandatory for Microsoft IIS, Azure App Services, Windows Server, Tomcat.',
            descriptionFa: 'کانتینر رمزشده حاوی گواهی عمومی، کلید خصوصی و زنجیره میانی. فرمت الزامی برای Microsoft IIS، سرویس‌های Azure و ویندوز سرور.',
            targetPlatforms: ['Microsoft IIS', 'Azure App Services', 'Windows Server', 'Tomcat', 'Citrix Gateway'],
            missingRequirements: {
              needsPrivateKey: false,
              needsModulusMatch: isMismatch,
              errorMessageEn: isMismatch
                ? 'Cryptographic Modulus Mismatch: The provided Private Key does not correspond to this Certificate.'
                : 'PKCS#12 export failed: The private key format was invalid or could not be packaged.',
              errorMessageFa: isMismatch
                ? 'عدم تطابق ماژولوس رمزنگاری: کلید خصوصی ارائه شده با این گواهی همخوانی ندارد.'
                : 'خطا در تولید PKCS#12: فرمت کلید خصوصی نامعتبر است یا امکان بسته‌بندی آن وجود نداشت.',
              instructionEn: isMismatch
                ? 'A PKCS#12 (.pfx) bundle strictly requires the matching private key generated with the CSR for this certificate. Please supply the corresponding key.'
                : 'Ensure the private key is a valid unencrypted RSA/EC key in PEM format.',
              instructionFa: isMismatch
                ? 'بسته PKCS#12 (.pfx) الزاماً نیازمند کلید خصوصی متناظری است که همراه با درخواست CSR برای این گواهی ایجاد شده بود. لطفاً کلید متناظر را وارد نمایید.'
                : 'اطمینان حاصل کنید که کلید خصوصی معتبر و در فرمت استاندارد PEM بدون رمز است.',
              commandExample: `openssl pkcs12 -export -out "${safeCn}.pfx" -inkey "${safeCn}.key" -in "${safeCn}.crt"${hasCa ? ` -certfile "${safeCn}_ca_bundle.crt"` : ''}${pfxPass ? ` -passout pass:${pfxPass}` : ''}`,
            },
          });
        }
      } else {
        outputs.push({
          id: 'pkcs12_pfx',
          format: 'PKCS#12 Archive (.pfx / .p12)',
          filename: `${safeCn}.pfx`,
          mimeType: 'application/x-pkcs12',
          isBinary: true,
          sizeBytes: 0,
          status: 'requires_action',
          descriptionEn: 'Encrypted password-protected container holding public certificate, private key, and intermediate chain. Mandatory for Microsoft IIS, Azure App Services, Windows Server, Tomcat.',
          descriptionFa: 'کانتینر رمزشده حاوی گواهی عمومی، کلید خصوصی و زنجیره میانی. فرمت الزامی برای Microsoft IIS، سرویس‌های Azure و ویندوز سرور.',
          targetPlatforms: ['Microsoft IIS', 'Azure App Services', 'Windows Server', 'Tomcat', 'Citrix Gateway'],
          missingRequirements: {
            needsPrivateKey: true,
            needsModulusMatch: false,
            errorMessageEn: 'Private Key (.key) is required to generate a PKCS#12 (.pfx) file.',
            errorMessageFa: 'برای تولید فایل PKCS#12 (.pfx) نیاز به کلید خصوصی (.key) متناظر است.',
            instructionEn: 'A .pfx archive is an encrypted container that securely bundles the Public Certificate and the Private Key together for Windows IIS, Azure, and Tomcat. Because only the public certificate was provided in the input, the .pfx binary file cannot be assembled. To generate this file: paste or upload your Private Key in the field above, enter an optional password, and click "Convert & Generate All Output Formats".',
            instructionFa: 'آرشیو .pfx یک کانتینر رمزشده است که گواهی عمومی و کلید خصوصی را برای وب‌سرورهای IIS ویندوز، سرویس‌های Azure و Tomcat یکپارچه می‌کند. از آنجا که تنها گواهی عمومی وارد شده است، امکان ساخت فایل .pfx وجود ندارد. برای تولید این فرمت: کلید خصوصی خود را در فیلد بالا وارد کرده، در صورت تمایل رمز عبور تعیین نمایید و مجدداً دکمه «تبدیل و ایجاد تمام فرمت‌ها» را بزنید.',
            commandExample: `openssl pkcs12 -export -out "${safeCn}.pfx" -inkey "${safeCn}.key" -in "${safeCn}.crt"${hasCa ? ` -certfile "${safeCn}_ca_bundle.crt"` : ''}${pfxPass ? ` -passout pass:${pfxPass}` : ''}`,
          },
        });
      }

      // 2. Binary DER Certificate (.cer / .der)
      try {
        const derBuffer = execSync(`openssl x509 -in "${certPath}" -outform der 2>/dev/null`);
        outputs.push({
          id: 'der_cer',
          format: 'DER Binary Certificate (.cer / .der)',
          filename: `${safeCn}.cer`,
          mimeType: 'application/pkix-cert',
          isBinary: true,
          base64: derBuffer.toString('base64'),
          descriptionEn: 'Raw binary ASN.1 encoded format without text headers. Required by Windows Certificate Manager, Java Keystores, Cisco ASA/ISE, Fortinet.',
          descriptionFa: 'فرمت باینری خام ASN.1 بدون هدرهای متنی. مورد نیاز Windows Certificate Manager، Java Keystores، فایروال‌های Cisco و Fortinet.',
          targetPlatforms: ['Windows Cert Manager', 'Java KeyStore (JKS)', 'Cisco ASA / ISE', 'Fortinet FortiGate'],
          sizeBytes: derBuffer.length,
        });
      } catch (derErr: any) {
        console.warn('[CertConverter] DER generation error:', derErr.message);
      }

      // 3. PKCS#7 / P7B Base64 (.p7b)
      try {
        const p7bCmd = hasCa
          ? `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -certfile "${caPath}" -outform PEM 2>/dev/null`
          : `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -outform PEM 2>/dev/null`;
        const p7bText = execSync(p7bCmd).toString();
        outputs.push({
          id: 'pkcs7_p7b',
          format: 'PKCS#7 Certificate Chain (.p7b)',
          filename: `${safeCn}.p7b`,
          mimeType: 'application/x-pkcs7-certificates',
          isBinary: false,
          text: p7bText,
          descriptionEn: 'Cryptographic Message Syntax standard containing certificate and CA chains without private key. Used by Microsoft IIS, Exchange, Tomcat.',
          descriptionFa: 'استاندارد رمزنگاری حاوی گواهی و زنجیره CA بدون کلید خصوصی. مورد استفاده در Microsoft IIS، Exchange و سرورهای جاوا/Tomcat.',
          targetPlatforms: ['Microsoft IIS', 'Microsoft Exchange', 'Apache Tomcat', 'Lotus Domino'],
          sizeBytes: Buffer.byteLength(p7bText, 'utf8'),
        });
      } catch (p7bErr: any) {
        console.warn('[CertConverter] P7B generation error:', p7bErr.message);
      }

      // 4. PKCS#7 Binary DER (.p7b / .p7c)
      try {
        const p7bDerCmd = hasCa
          ? `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -certfile "${caPath}" -outform DER 2>/dev/null`
          : `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -outform DER 2>/dev/null`;
        const p7bDerBuffer = execSync(p7bDerCmd);
        outputs.push({
          id: 'pkcs7_der',
          format: 'PKCS#7 Binary (.p7c / .p7b)',
          filename: `${safeCn}.p7c`,
          mimeType: 'application/pkcs7-mime',
          isBinary: true,
          base64: p7bDerBuffer.toString('base64'),
          descriptionEn: 'Binary DER-encoded PKCS#7 certificate chain format.',
          descriptionFa: 'فرمت باینری DER برای زنجیره گواهی‌های PKCS#7.',
          targetPlatforms: ['Windows PKI', 'Java Application Servers'],
          sizeBytes: p7bDerBuffer.length,
        });
      } catch (p7bDerErr: any) {
        console.warn('[CertConverter] P7B DER generation error:', p7bDerErr.message);
      }

      // 5. Full Chain PEM (Certificate + CA Bundle)
      if (hasCa) {
        const fullChainText = `${certPem}\n\n${caBundlePem}\n`;
        outputs.push({
          id: 'fullchain_pem',
          format: 'Full Chain PEM (.pem / .crt)',
          filename: `${safeCn}_fullchain.pem`,
          mimeType: 'application/x-pem-file',
          isBinary: false,
          text: fullChainText,
          descriptionEn: 'Combines your public certificate with intermediate and root CA certificates into a single ordered bundle. Essential for Nginx ssl_certificate & Apache 2.4.8+.',
          descriptionFa: 'ترکیب گواهی عمومی شما با گواهی‌های میانی و ریشه CA در یک فایل پیوسته. حیاتی برای پیکربندی ssl_certificate در Nginx و Apache 2.4.8+.',
          targetPlatforms: ['Nginx (ssl_certificate)', 'Apache 2.4.8+', 'HAProxy', 'Let\'s Encrypt / Certbot compatible'],
          sizeBytes: Buffer.byteLength(fullChainText, 'utf8'),
        });

        // CA Bundle standalone
        outputs.push({
          id: 'ca_bundle_pem',
          format: 'Intermediate CA Bundle (.ca-bundle / .crt)',
          filename: `${safeCn}_ca_bundle.crt`,
          mimeType: 'application/x-x509-ca-cert',
          isBinary: false,
          text: caBundlePem + '\n',
          descriptionEn: 'Standalone intermediate and root authority certificate chain. Used for SSLCertificateChainFile in Apache and legacy systems.',
          descriptionFa: 'زنجیره مستقل مراجع میانی و ریشه. مورد نیاز برای پارامتر SSLCertificateChainFile در وب‌سرورهای قدیمی آپاچی.',
          targetPlatforms: ['Apache (SSLCertificateChainFile)', 'Postfix / Dovecot', 'Sendmail'],
          sizeBytes: Buffer.byteLength(caBundlePem, 'utf8'),
        });
      }

      // 6. Formatted Certificate Inspection Report (.txt)
      const reportLines = [
        '=================================================================',
        ` SSL / TLS CERTIFICATE SPECIFICATION REPORT`,
        '=================================================================',
        `Generated At:        ${new Date().toISOString()}`,
        `Common Name (CN):    ${certInfo.commonName}`,
        `Subject DN:          ${certInfo.subject}`,
        `Issuer Authority:    ${certInfo.issuer}`,
        `Issuer Organization: ${certInfo.issuerOrg}`,
        `Serial Number:       ${certInfo.serialNumber}`,
        `Key Algorithm:       ${certInfo.keyType} (${certInfo.keyBits} bits)`,
        `Valid From:          ${certInfo.validFrom} UTC`,
        `Valid To:            ${certInfo.validTo} UTC`,
        `Days Remaining:      ${certInfo.daysRemaining} days`,
        `Status:              ${certInfo.isExpired ? 'EXPIRED' : 'ACTIVE / VALID'}`,
        `SHA-256 Fingerprint: ${certInfo.sha256Fingerprint}`,
        `SHA-1 Fingerprint:   ${certInfo.sha1Fingerprint}`,
        '-----------------------------------------------------------------',
        `Subject Alternative Names (${certInfo.sans.length} SANs):`,
        ...certInfo.sans.map((s) => `  - ${s}`),
        '=================================================================',
      ];
      if (hasKey) {
        reportLines.push(
          `Private Key Status:  Provided`,
          `Modulus Match:       ${keyMatch.matches ? 'VERIFIED (100% Match)' : 'MISMATCH WARNING'}`,
          `Modulus MD5 Hash:    ${keyMatch.certModulusHash || 'N/A'}`
        );
      }
      const reportText = reportLines.join('\n') + '\n';
      outputs.push({
        id: 'cert_details_txt',
        format: 'Certificate Technical Report (.txt)',
        filename: `${safeCn}_details.txt`,
        mimeType: 'text/plain',
        isBinary: false,
        text: reportText,
        descriptionEn: 'Human-readable plain text report with all decoded X.509 fields, validity window, and cryptographic hashes.',
        descriptionFa: 'گزارش متنی شفاف با مشخصات کامل گواهی، بازه اعتبار و هش‌های رمزنگاری.',
        targetPlatforms: ['Documentation', 'Audit & Compliance', 'DevOps Handover'],
        sizeBytes: Buffer.byteLength(reportText, 'utf8'),
      });

      // If Private Key is provided:
      if (hasKey) {
        // Combined PEM (.pem) (Cert + CA Bundle + Private Key)
        try {
          const combinedParts: string[] = [certPem];
          if (hasCa) {
            combinedParts.push(caBundlePem);
          }
          combinedParts.push(keyPem);
          const combinedText = combinedParts.join('\n\n') + '\n';

          outputs.push({
            id: 'combined_pem',
            format: 'Combined PEM Bundle (.pem)',
            filename: `${safeCn}_combined.pem`,
            mimeType: 'application/x-pem-file',
            isBinary: false,
            text: combinedText,
            descriptionEn: 'Single unified PEM file concatenating Certificate, Intermediate CA Chain, and Private Key in standard RFC order. Required by HAProxy, Lighttpd, stunnel, Courier, AWS ELB.',
            descriptionFa: 'یک فایل یکپارچه PEM شامل گواهی، زنجیره میانی و کلید خصوصی با ترتیب استاندارد. مورد نیاز HAProxy، Lighttpd، stunnel و AWS ELB.',
            targetPlatforms: ['HAProxy', 'Lighttpd', 'stunnel', 'Courier IMAP', 'AWS ELB'],
            sizeBytes: Buffer.byteLength(combinedText, 'utf8'),
          });
        } catch (combErr: any) {
          console.warn('[CertConverter] Combined PEM error:', combErr.message);
        }

        // 9. Clean Private Key (.key)
        outputs.push({
          id: 'private_key',
          format: 'Private Key (.key)',
          filename: `${safeCn}.key`,
          mimeType: 'application/x-pem-file',
          isBinary: false,
          text: keyPem + '\n',
          descriptionEn: 'Extracted standalone private key in PEM format. Keep this secure and never share it publicly.',
          descriptionFa: 'کلید خصوصی مستقل در فرمت استاندارد PEM. این فایل را محرمانه نگه داشته و از افشای آن خودداری کنید.',
          targetPlatforms: ['Nginx (ssl_certificate_key)', 'Apache (SSLCertificateKeyFile)', 'Node.js HTTPS', 'Golang TLS'],
          sizeBytes: Buffer.byteLength(keyPem, 'utf8'),
        });

        // 10. PKCS#8 Unencrypted Private Key (.key)
        try {
          const pkcs8Text = execSync(
            `openssl pkcs8 -topk8 -inform PEM -outform PEM -in "${keyPath}" -nocrypt 2>/dev/null`
          ).toString();
          if (pkcs8Text && pkcs8Text.includes('BEGIN PRIVATE KEY-----')) {
            outputs.push({
              id: 'pkcs8_key',
              format: 'PKCS#8 Private Key (.key)',
              filename: `${safeCn}_pkcs8.key`,
              mimeType: 'application/x-pem-file',
              isBinary: false,
              text: pkcs8Text,
              descriptionEn: 'Modern standard PKCS#8 private key representation. Preferred by Java, modern cryptographic APIs, and cloud services.',
              descriptionFa: 'فرمت مدرن استاندارد PKCS#8 برای کلید خصوصی. مورد ترجیح در جاوا و فریم‌ورک‌های جدید وب.',
              targetPlatforms: ['Java / Netty', 'Google Cloud', 'Spring Boot', 'Modern OpenSSL'],
              sizeBytes: Buffer.byteLength(pkcs8Text, 'utf8'),
            });
          }
        } catch (pk8Err: any) {
          console.warn('[CertConverter] PKCS#8 key conversion error:', pk8Err.message);
        }
      }

      // Generate comprehensive ZIP suite containing all converted files
      let zipBase64 = '';
      const zipFilename = `${safeCn}_ssl_suite.zip`;
      let zipSizeBytes = 0;
      let zipFileCount = 0;

      try {
        const bundleDir = path.join(tmpDir, 'bundle');
        fs.mkdirSync(bundleDir, { recursive: true });

        // Save every generated output into the bundle directory
        for (const out of outputs) {
          if (out.status === 'requires_action' || (!out.base64 && !out.text)) {
            continue;
          }
          const filePath = path.join(bundleDir, out.filename);
          if (out.isBinary && out.base64) {
            fs.writeFileSync(filePath, Buffer.from(out.base64, 'base64'));
            zipFileCount++;
          } else if (out.text) {
            fs.writeFileSync(filePath, out.text, 'utf8');
            zipFileCount++;
          }
        }

        const pfxItem = outputs.find((o) => o.id === 'pkcs12_pfx');
        const pfxIncluded = pfxItem && pfxItem.status === 'ready' && pfxItem.base64;

        // Add deployment guide README
        const readmeContent = `===================================================================
SSL / TLS CERTIFICATE DEPLOYMENT BUNDLE - ${certInfo?.commonName || safeCn}
===================================================================
Generated: ${new Date().toISOString()}
Domain (Common Name): ${certInfo?.commonName || safeCn}
Issuer: ${certInfo?.issuerOrg || certInfo?.issuer || 'N/A'}
Valid Until: ${certInfo?.validTo || 'N/A'}
Days Remaining: ${certInfo?.daysRemaining ?? 'N/A'}
Key Type: ${certInfo?.keyType || 'RSA'} ${certInfo?.keyBits || 2048} bits

FILES INCLUDED IN THIS ARCHIVE:
-------------------------------------------------------------------
1. ${safeCn}.crt (or .cer, .pem)
   - Standard X.509 Certificate in PEM format (Base64 ASCII).
   - Suitable for Nginx, Apache, HAProxy, AWS ALB, Node.js, Python, etc.

2. ${safeCn}.pfx / .p12
   - PKCS#12 Archive (Certificate + Private Key + Intermediate Chain).
   - Status: ${pfxIncluded ? `Generated & Included (Password: ${pfxPass ? 'Set' : 'Blank'})` : 'Not Included (Requires matching Private Key)'}
   - Required by Microsoft IIS, Azure App Service, Windows Server, Tomcat.

3. ${safeCn}_fullchain.crt
   - Full Certificate Chain (Server Certificate + Intermediate CA + Root CA).
   - Recommended for Nginx (ssl_certificate), Traefik, Caddy, Envoy.

4. ${safeCn}_ca_chain.crt
   - Intermediate and Root CA certificates bundle.
   - Use for Apache (SSLCACertificateFile / SSLCertificateChainFile).

5. ${safeCn}.key
   - Standalone private key in PEM format (if provided).
   - Required by web servers and proxies for SSL handshakes.

6. ${safeCn}.p7b
   - PKCS#7 / P7B Certificate Bundle.
   - Used by Java Keystores, Windows MMC, Exchange Server, Tomcat.

7. ${safeCn}_der.cer
   - Binary DER-encoded X.509 certificate.
   - Used by Windows MMC, Cisco ASA/IOS, FortiGate, F5 BIG-IP, embedded appliances.

8. ${safeCn}_spec_report.txt
   - Technical cryptographic audit and inspection report.

-------------------------------------------------------------------
QUICK CONFIGURATION EXAMPLES:

* NGINX:
  ssl_certificate /etc/ssl/certs/${safeCn}_fullchain.crt;
  ssl_certificate_key /etc/ssl/private/${safeCn}.key;

* APACHE:
  SSLEngine on
  SSLCertificateFile /etc/ssl/certs/${safeCn}.crt
  SSLCertificateKeyFile /etc/ssl/private/${safeCn}.key
  SSLCACertificateFile /etc/ssl/certs/${safeCn}_ca_chain.crt

* MICROSOFT IIS:
  Import ${safeCn}.pfx directly into IIS Server Certificates via Windows MMC.
===================================================================
`;
        fs.writeFileSync(path.join(bundleDir, 'README_DEPLOYMENT.txt'), readmeContent, 'utf8');
        zipFileCount++;

        const zipPath = path.join(tmpDir, zipFilename);
        execSync(`python3 -m zipfile -c "${zipPath}" *`, { cwd: bundleDir });
        if (fs.existsSync(zipPath)) {
          const zipBuf = fs.readFileSync(zipPath);
          zipSizeBytes = zipBuf.length;
          zipBase64 = zipBuf.toString('base64');
        }
      } catch (zipErr: any) {
        console.warn('[CertConverter] Failed to generate ZIP archive:', zipErr.message);
      }

      return res.json({
        success: true,
        certInfo,
        keyMatch,
        hasPrivateKey: hasKey,
        hasCaBundle: hasCa,
        isCombinedFound,
        extractedCertPem: certPem,
        extractedKeyPem: keyPem,
        extractedCaBundlePem: caBundlePem,
        notes,
        outputs,
        zipFilename,
        zipBase64,
        zipSizeBytes,
        zipFileCount,
      });
    } catch (err: any) {
      console.error('[CertConverter Error]', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'An error occurred during certificate conversion.',
      });
    } finally {
      if (tmpDir && fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  /**
   * PFX / PKCS#12 Extraction API: Extracts Certificate, Key, and Chain from uploaded PFX/P12
   */
  app.post('/api/tools/cert-extract-pfx', async (req: Request, res: Response) => {
    let tmpDir = '';
    try {
      const { pfxBase64, password } = req.body || {};
      if (!pfxBase64) {
        return res.status(400).json({
          success: false,
          error: 'PFX / PKCS#12 file content (Base64) is required.',
        });
      }

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-ext-'));
      const pfxPath = path.join(tmpDir, 'input.pfx');
      const pfxBuffer = Buffer.from(pfxBase64, 'base64');
      fs.writeFileSync(pfxPath, pfxBuffer);

      const passArg = password ? `-passin "pass:${password}"` : `-passin "pass:"`;

      // 1. Extract Private Key
      let privateKeyPem = '';
      try {
        privateKeyPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -nocerts -nodes ${passArg} 2>/dev/null`
        ).toString();
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: 'Failed to decrypt PFX/P12 archive. Please verify the password entered.',
        });
      }

      // 2. Extract Client / Server Certificate
      let certPem = '';
      try {
        certPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -clcerts -nokeys ${passArg} 2>/dev/null`
        ).toString();
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: `Failed to extract leaf certificate from PFX: ${err.message}`,
        });
      }

      // 3. Extract CA Chain (Intermediate & Root)
      let caChainPem = '';
      try {
        caChainPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -cacerts -nokeys ${passArg} 2>/dev/null`
        ).toString();
      } catch {}

      // Normalize extracted components
      const extracted = normalizeAndExtractPems(certPem, privateKeyPem, caChainPem);
      const cleanCert = extracted.certPem;
      const cleanKey = extracted.keyPem;
      const cleanChain = extracted.caBundlePem;

      const certInfo = parseCertificateDetails(cleanCert, tmpDir);

      return res.json({
        success: true,
        certPem: cleanCert,
        privateKeyPem: cleanKey,
        caChainPem: cleanChain,
        certInfo,
      });
    } catch (err: any) {
      console.error('[CertExtractPFX Error]', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to extract PFX archive.',
      });
    } finally {
      if (tmpDir && fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    }
  });
}
