import React, { useState, useRef, useMemo } from 'react';
import {
  FileCode,
  Download,
  Copy,
  Check,
  Upload,
  Key,
  Shield,
  Layers,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderArchive,
  FileText,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  ExternalLink,
  Tag,
  Calendar,
  Fingerprint,
  X
} from 'lucide-react';

interface OutputMissingRequirements {
  needsPrivateKey?: boolean;
  needsModulusMatch?: boolean;
  needsPassword?: boolean;
  errorMessageEn?: string;
  errorMessageFa?: string;
  instructionEn?: string;
  instructionFa?: string;
  commandExample?: string;
}

interface ConvertedOutput {
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

interface CertInfo {
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

interface KeyMatch {
  checked: boolean;
  matches: boolean;
  certModulusHash?: string;
  keyModulusHash?: string;
  messageEn?: string;
  messageFa?: string;
}

interface CertConverterTabProps {
  isEn: boolean;
  isLightMode: boolean;
}

export const CertConverterTab: React.FC<CertConverterTabProps> = ({ isEn, isLightMode }) => {
  const [activeSubTab, setActiveSubTab] = useState<'convert' | 'extract'>('convert');

  // Input states for Convert
  const [certText, setCertText] = useState<string>('');
  const [keyText, setKeyText] = useState<string>('');
  const [caBundleText, setCaBundleText] = useState<string>('');
  const [pfxPassword, setPfxPassword] = useState<string>('');
  const [showPfxPassword, setShowPfxPassword] = useState<boolean>(false);
  const [friendlyName, setFriendlyName] = useState<string>('');
  const [showKeyField, setShowKeyField] = useState<boolean>(false);
  const [showCaField, setShowCaField] = useState<boolean>(false);

  // Input states for Extract
  const [extractPfxBase64, setExtractPfxBase64] = useState<string>('');
  const [extractFileName, setExtractFileName] = useState<string>('');
  const [extractPassword, setExtractPassword] = useState<string>('');
  const [showExtractPassword, setShowExtractPassword] = useState<boolean>(false);

  // Processing & Results
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [keyMatch, setKeyMatch] = useState<KeyMatch | null>(null);
  const [outputs, setOutputs] = useState<ConvertedOutput[]>([]);
  const [zipData, setZipData] = useState<{
    filename: string;
    base64: string;
    sizeBytes: number;
    fileCount: number;
  } | null>(null);
  const [previewItem, setPreviewItem] = useState<ConvertedOutput | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // File input refs
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const keyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const caFileInputRef = useRef<HTMLInputElement>(null);
  const pfxFileInputRef = useRef<HTMLInputElement>(null);

  // Helper to split raw text containing both certificate and private key
  const splitCombinedText = (rawInput: string) => {
    const raw = (rawInput || '')
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Matches any private key block: RSA PRIVATE KEY, EC PRIVATE KEY, OPENSSH, ENCRYPTED, etc.
    const keyRegex =
      /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*PRIVATE\s+KEY)[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi;

    // Matches any certificate block variation: CERTIFICATE, SERVER CERTIFICATE, SSL CERTIFICATE,
    // X509, TRUSTED, PKCS7, etc. with arbitrary dashes, spaces, and linebreaks.
    const certRegex =
      /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509))[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509)[-~=_\s]*/gi;

    const keys: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(raw)) !== null) {
      let header = match[1].trim().toUpperCase();
      if (!header.includes('KEY')) header = `${header} PRIVATE KEY`;
      const body = match[2];
      const lines = body.split(/[\r\n]+/);
      const validLines = lines.filter((l) => {
        const t = l.trim();
        if (!t || t.startsWith('Bag Attributes') || t.startsWith('subject=')) return false;
        if (t.startsWith('Proc-Type:') || t.startsWith('DEK-Info:')) return true;
        if (t.includes(' ') || t.includes(':')) return false;
        return /^[A-Za-z0-9+/=]+$/.test(t);
      });
      let content = validLines.join('\n');
      if (!content) {
        const rawFiltered = body.replace(/[^A-Za-z0-9+/=]/g, '');
        content = rawFiltered.match(/.{1,64}/g)?.join('\n') || rawFiltered;
      }
      if (content) {
        keys.push(`-----BEGIN ${header}-----\n${content}\n-----END ${header}-----`);
      }
    }

    const certs: string[] = [];
    while ((match = certRegex.exec(raw)) !== null) {
      const tag = match[1].trim().toUpperCase();
      const body = match[2];
      const lines = body.split(/[\r\n]+/);
      const validB64Lines = lines.filter((l) => {
        const t = l.trim();
        if (
          !t ||
          t.includes(' ') ||
          t.includes(':') ||
          t.startsWith('Bag Attributes') ||
          t.startsWith('subject=') ||
          t.startsWith('issuer=')
        ) {
          return false;
        }
        return /^[A-Za-z0-9+/=]+$/.test(t);
      });
      let b64 = validB64Lines.join('');
      if (!b64) b64 = body.replace(/[^A-Za-z0-9+/=]/g, '');
      if (b64.length % 4 !== 0) b64 += '='.repeat((4 - (b64.length % 4)) % 4);
      if (b64.length > 40) {
        const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;
        const isPkcs7 = tag.includes('PKCS');
        const header = isPkcs7 ? 'PKCS7' : 'CERTIFICATE';
        certs.push(`-----BEGIN ${header}-----\n${chunked}\n-----END ${header}-----`);
      }
    }

    // If no certificates found with standard regex, check leftover text after removing keys
    const textWithoutKeys = raw
      .replace(
        /[-~=_\s]*BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[\s\S]*?END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi,
        ''
      )
      .trim();

    if (certs.length === 0 && textWithoutKeys) {
      // Look for MII-prefixed base64 streams (standard for all X.509 certificates)
      const cleanB64 = textWithoutKeys.replace(/[\r\n\s]/g, '');
      const miiRegex = /(MII[A-Za-z0-9+/=]{80,})/g;
      let m: RegExpExecArray | null;
      while ((m = miiRegex.exec(cleanB64)) !== null) {
        let cand = m[1];
        if (cand.length % 4 !== 0) cand += '='.repeat((4 - (cand.length % 4)) % 4);
        const chunked = cand.match(/.{1,64}/g)?.join('\n') || cand;
        certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
      }

      // If still empty but text has content, retain it so the server can inspect/parse it
      if (certs.length === 0 && textWithoutKeys.length > 20) {
        certs.push(textWithoutKeys);
      }
    }

    let changed = false;
    if (certs.length > 0) {
      setCertText(certs[0]);
      changed = true;
      if (certs.length > 1) {
        setCaBundleText(certs.slice(1).join('\n\n'));
        setShowCaField(true);
      }
    } else if (textWithoutKeys) {
      setCertText(textWithoutKeys);
      changed = true;
    }

    if (keys.length > 0) {
      setKeyText(keys[0]);
      setShowKeyField(true);
      changed = true;
    }

    if (changed) {
      setSuccessMessage(
        isEn
          ? 'Certificate and Private Key parsed and populated into dedicated fields successfully!'
          : 'گواهی و کلید خصوصی با موفقیت تفکیک و در فیلدهای اختصاصی جای‌گذاری شدند!'
      );
    }
  };

  const hasCombinedKeysInCert = useMemo(() => {
    return Boolean(
      certText &&
        (certText.includes('PRIVATE KEY') ||
          certText.includes('KEY-----') ||
          /BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY/i.test(certText))
    );
  }, [certText]);

  // File upload helpers
  const handleCertFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so uploading the same file again triggers onChange
    e.target.value = '';

    // If user uploaded a PFX/P12 file, switch to Extract tab automatically
    if (file.name.toLowerCase().endsWith('.pfx') || file.name.toLowerCase().endsWith('.p12')) {
      setActiveSubTab('extract');
      setExtractFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          setExtractPfxBase64(btoa(binary));
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        const isDerBinary =
          bytes.length > 50 &&
          bytes[0] === 0x30 &&
          (bytes[1] === 0x82 || bytes[1] === 0x81 || bytes[1] === 0x80);
        if (isDerBinary) {
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const b64 = btoa(binary);
          const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;
          setCertText(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
          setSuccessMessage(
            isEn
              ? 'Binary DER certificate converted to PEM successfully!'
              : 'گواهی باینری DER با موفقیت شناسایی و به PEM تبدیل شد!'
          );
        } else {
          const text = new TextDecoder('utf-8').decode(bytes);
          splitCombinedText(text);
        }
      } else if (typeof result === 'string') {
        splitCombinedText(result);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        if (content.includes('CERTIFICATE') || content.includes('PKCS')) {
          splitCombinedText(content);
        } else {
          setKeyText(content);
          setShowKeyField(true);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleCaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCaBundleText(content);
        setShowCaField(true);
      }
    };
    reader.readAsText(file);
  };

  const handlePfxFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        setExtractPfxBase64(b64);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Convert Action
  const handleConvert = async () => {
    if (!certText.trim() && !keyText.trim()) {
      setError(
        isEn
          ? 'Please paste or upload an SSL/TLS certificate or key text first.'
          : 'لطفاً ابتدا متن گواهی SSL/TLS یا کلید را وارد یا آپلود کنید.'
      );
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/tools/cert-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certText: certText.trim(),
          keyText: keyText.trim(),
          caBundleText: caBundleText.trim(),
          pfxPassword: pfxPassword,
          friendlyName: friendlyName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? 'Certificate conversion failed' : 'تبدیل گواهی با خطا مواجه شد'));
      }

      setCertInfo(data.certInfo);
      setKeyMatch(data.keyMatch);
      setOutputs(data.outputs || []);

      if (data.zipBase64 && data.zipFilename) {
        setZipData({
          filename: data.zipFilename,
          base64: data.zipBase64,
          sizeBytes: data.zipSizeBytes || 0,
          fileCount: data.zipFileCount || data.outputs?.length || 0,
        });
      } else {
        setZipData(null);
      }

      if (data.isCombinedFound || !keyText.trim() || !certText.trim()) {
        if (data.extractedKeyPem) {
          setKeyText(data.extractedKeyPem);
          setShowKeyField(true);
        }
        if (data.extractedCaBundlePem) {
          setCaBundleText(data.extractedCaBundlePem);
          setShowCaField(true);
        }
        if (data.extractedCertPem) {
          setCertText(data.extractedCertPem);
        }
      }

      setSuccessMessage(
        isEn
          ? `Successfully converted into ${data.outputs?.length || 0} production-ready formats and prepared unified ZIP package!${
              data.isCombinedFound ? ' (Extracted & matched both certificate and private key)' : ''
            }`
          : `تبدیل گواهی با موفقیت به ${data.outputs?.length || 0} فرمت استاندارد انجام شد و بسته زیپ آماده گردید!${
              data.isCombinedFound ? ' (گواهی و کلید خصوصی با موفقیت تفکیک و تطبیق داده شدند)' : ''
            }`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract from PFX Action
  const handleExtractPfx = async () => {
    if (!extractPfxBase64) {
      setError(isEn ? 'Please choose a .pfx or .p12 file to extract.' : 'لطفاً یک فایل .pfx یا .p12 را جهت استخراج انتخاب کنید.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/tools/cert-extract-pfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pfxBase64: extractPfxBase64,
          password: extractPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? 'Failed to extract PFX archive' : 'استخراج فایل PFX با خطا مواجه شد'));
      }

      // Automatically fill the convert tab with extracted components
      setCertText(data.certPem || '');
      setKeyText(data.privateKeyPem || '');
      setCaBundleText(data.caChainPem || '');
      setShowKeyField(true);
      if (data.caChainPem) setShowCaField(true);
      setActiveSubTab('convert');

      // Now run convert on these components
      handleConvert();

      setSuccessMessage(
        isEn
          ? 'PFX archive extracted successfully! Loaded Certificate and Private Key.'
          : 'آرشیو PFX با موفقیت رمزگشایی و گواهی و کلید خصوصی استخراج شدند.'
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download ZIP archive directly
  const handleDownloadZip = () => {
    if (!zipData || !zipData.base64) return;
    try {
      const byteCharacters = atob(zipData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipData.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP download error:', err);
    }
  };

  // Download individual file
  const handleDownloadItem = (item: ConvertedOutput) => {
    try {
      let blob: Blob;
      if (item.isBinary && item.base64) {
        const byteCharacters = atob(item.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: item.mimeType || 'application/octet-stream' });
      } else {
        blob = new Blob([item.text || ''], { type: item.mimeType || 'text/plain;charset=utf-8' });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Download all files - prefers single ZIP download
  const handleDownloadAll = () => {
    if (zipData && zipData.base64) {
      handleDownloadZip();
      return;
    }
    if (!outputs.length) return;
    outputs.forEach((item, index) => {
      setTimeout(() => {
        handleDownloadItem(item);
      }, index * 250);
    });
  };

  // Copy text content
  const handleCopyText = (item: ConvertedOutput) => {
    if (!item.text) return;
    navigator.clipboard.writeText(item.text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Clear all
  const handleClearAll = () => {
    setCertText('');
    setKeyText('');
    setCaBundleText('');
    setPfxPassword('');
    setFriendlyName('');
    setExtractPfxBase64('');
    setExtractFileName('');
    setExtractPassword('');
    setOutputs([]);
    setZipData(null);
    setCertInfo(null);
    setKeyMatch(null);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tabs: Convert vs Extract */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('convert')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubTab === 'convert'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                : isLightMode
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isEn ? 'Convert & Package Formats' : 'تبدیل و بسته‌بندی فرمت‌ها'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('extract')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubTab === 'extract'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                : isLightMode
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>{isEn ? 'Extract Archive (PFX / P12)' : 'استخراج از آرشیو PFX / P12'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(certText || outputs.length > 0) && (
            <button
              onClick={handleClearAll}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer text-slate-400 hover:text-red-400 ${
                isLightMode ? 'hover:bg-red-50' : 'hover:bg-slate-800'
              }`}
              title={isEn ? 'Clear All' : 'پاک کردن فرم'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Sub-Tab 1: Convert & Package Formats */}
      {activeSubTab === 'convert' && (
        <div className="space-y-4">
          {/* Certificate Input Card */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <Shield className="w-4 h-4 text-amber-500" />
                <span>{isEn ? 'Public Certificate (PEM / CRT / CER / Text) *' : 'گواهی عمومی SSL / TLS (فایل یا متن CRT / PEM / CER) *'}</span>
              </label>

              <div className="flex items-center gap-1.5">
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept=".crt,.pem,.cer,.der,.txt"
                  onChange={handleCertFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => certFileInputRef.current?.click()}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Upload className="w-3 h-3 text-cyan-400" />
                  <span>{isEn ? 'Upload File' : 'آپلود فایل'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={certText}
              onChange={(e) => setCertText(e.target.value)}
              placeholder={
                isEn
                  ? 'Paste your purchased SSL certificate text here (starts with -----BEGIN CERTIFICATE-----) or upload file above...'
                  : 'متن گواهی خریداری‌شده را اینجا پیست کنید (با -----BEGIN CERTIFICATE----- شروع می‌شود) یا فایل آن را از بالا آپلود کنید...'
              }
              className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                isLightMode
                  ? 'bg-white text-slate-900 border-slate-300 focus:border-amber-500'
                  : 'bg-slate-950 text-cyan-300 border-slate-800 focus:border-cyan-400'
              }`}
            />
            <p className="text-[10px] text-slate-400">
              {isEn
                ? 'Base64 encoded X.509 certificate. If provided alone, formats such as PEM, DER, PKCS#7 (P7B), and technical reports can be generated.'
                : 'گواهی استاندارد X.509. در صورت ارائه به تنهایی، فرمت‌های PEM، DER، PKCS#7 (P7B) و گزارش فنی استخراج می‌شوند.'}
            </p>

            {hasCombinedKeysInCert && (
              <div
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs gap-2 ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-[11px] leading-relaxed">
                    {isEn
                      ? 'Combined bundle detected (Certificate + Private Key)! Both will be processed and matched automatically.'
                      : 'پکیج ترکیبی شناسایی شد (گواهی + کلید خصوصی)! هر دو به صورت خودکار تفکیک، اعتبارسنجی و تبدیل خواهند شد.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => splitCombinedText(certText)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer shrink-0 shadow-sm"
                >
                  {isEn ? 'Split Fields' : 'تفکیک به فیلدها'}
                </button>
              </div>
            )}
          </div>

          {/* Optional Inputs Accordion Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyField(!showKeyField)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                showKeyField || keyText
                  ? isLightMode
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  : isLightMode
                  ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isEn ? 'Private Key (Optional)' : 'کلید خصوصی Private Key (اختیاری)'}</span>
              {showKeyField ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={() => setShowCaField(!showCaField)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                showCaField || caBundleText
                  ? isLightMode
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : isLightMode
                  ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'CA Bundle / Intermediate (Optional)' : 'زنجیره میانی CA Bundle (اختیاری)'}</span>
              {showCaField ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Private Key Input (Optional) */}
          {showKeyField && (
            <div
              className={`p-4 rounded-xl border space-y-2.5 animate-in fade-in ${
                isLightMode ? 'bg-indigo-50/40 border-indigo-200' : 'bg-indigo-950/20 border-indigo-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-indigo-900' : 'text-indigo-200'}`}>
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>{isEn ? 'Private Key (.key / PEM / RSA)' : 'کلید خصوصی سرور (.key / PEM / RSA)'}</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={keyFileInputRef}
                    type="file"
                    accept=".key,.pem,.txt"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => keyFileInputRef.current?.click()}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Upload className="w-3 h-3 text-indigo-400" />
                    <span>{isEn ? 'Upload Key' : 'آپلود کلید'}</span>
                  </button>
                </div>
              </div>

              <textarea
                ref={keyTextareaRef}
                rows={3}
                value={keyText}
                onChange={(e) => setKeyText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste RSA or EC Private Key (starts with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----)...'
                    : 'کلید خصوصی RSA یا EC را وارد کنید (با -----BEGIN PRIVATE KEY----- شروع می‌شود)...'
                }
                className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                  isLightMode
                    ? 'bg-white text-slate-900 border-slate-300 focus:border-indigo-500'
                    : 'bg-slate-950 text-indigo-300 border-slate-800 focus:border-indigo-400'
                }`}
              />
              <p className="text-[10px] text-slate-400">
                {isEn
                  ? 'Providing the private key unlocks PKCS#12 (PFX), Combined PEM, PKCS#8, and performs mathematical modulus matching to verify key integrity.'
                  : 'افزودن کلید خصوصی امکان خروجی‌های PKCS#12 (PFX)، Combined PEM، PKCS#8 و بررسی صحت تطابق ماژولوس کلید را فعال می‌کند.'}
              </p>
            </div>
          )}

          {/* CA Bundle Input (Optional) */}
          {showCaField && (
            <div
              className={`p-4 rounded-xl border space-y-2.5 animate-in fade-in ${
                isLightMode ? 'bg-cyan-50/40 border-cyan-200' : 'bg-cyan-950/20 border-cyan-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-cyan-900' : 'text-cyan-200'}`}>
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Intermediate & Root CA Bundle (.ca-bundle / PEM)' : 'زنجیره گواهی‌های میانی و ریشه (.ca-bundle / PEM)'}</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={caFileInputRef}
                    type="file"
                    accept=".ca-bundle,.crt,.pem,.txt"
                    onChange={handleCaFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => caFileInputRef.current?.click()}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Upload className="w-3 h-3 text-cyan-400" />
                    <span>{isEn ? 'Upload CA Bundle' : 'آپلود CA Bundle'}</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={caBundleText}
                onChange={(e) => setCaBundleText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste intermediate and root CA certificates chain here...'
                    : 'متن گواهی‌های واسط و ریشه (Intermediate/Root CA) را اینجا پیست کنید...'
                }
                className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                  isLightMode
                    ? 'bg-white text-slate-900 border-slate-300 focus:border-cyan-500'
                    : 'bg-slate-950 text-cyan-300 border-slate-800 focus:border-cyan-400'
                }`}
              />
            </div>
          )}

          {/* Optional PFX Export Parameters (Password & Alias) */}
          <div
            className={`p-3.5 rounded-xl border grid grid-cols-1 sm:grid-cols-2 gap-3 ${
              isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'PFX / PKCS#12 Export Password (Optional)' : 'رمز عبور خروجی PFX / PKCS#12 (اختیاری)'}
              </label>
              <div className="relative">
                <input
                  type={showPfxPassword ? 'text' : 'password'}
                  value={pfxPassword}
                  onChange={(e) => setPfxPassword(e.target.value)}
                  placeholder={isEn ? 'Leave blank for unencrypted PFX or enter password' : 'برای خروجی بدون رمز خالی بگذارید یا رمز تعیین کنید'}
                  className={`w-full pr-8 pl-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPfxPassword(!showPfxPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                >
                  {showPfxPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Friendly Name / Alias (Optional)' : 'نام مستعار گواهی / Alias (اختیاری)'}
              </label>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder={isEn ? 'e.g. mysite.com' : 'مثلاً mysite.ir'}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
              />
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleConvert}
            disabled={isProcessing}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
              isProcessing
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : isLightMode
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isEn ? 'Cryptographically Converting Certificate...' : 'در حال تبدیل و استخراج رمزنگاری گواهی...'}</span>
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                <span>{isEn ? 'Convert & Generate All Output Formats' : 'تبدیل و ایجاد تمام فرمت‌های استاندارد'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Sub-Tab 2: Extract Archive (PFX / P12) */}
      {activeSubTab === 'extract' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <FolderArchive className="w-4 h-4 text-amber-500" />
                <span>{isEn ? 'Select .PFX / .P12 Archive File' : 'انتخاب فایل آرشیو .PFX یا .P12'}</span>
              </label>

              <input
                ref={pfxFileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={handlePfxFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => pfxFileInputRef.current?.click()}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>{extractFileName ? extractFileName : (isEn ? 'Browse .pfx / .p12' : 'انتخاب فایل PFX / P12')}</span>
              </button>
            </div>

            {extractFileName && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <FileCheck className="w-4 h-4 shrink-0" />
                <span className="font-mono">{extractFileName}</span>
              </div>
            )}

            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Archive Decryption Password' : 'رمز عبور بازگشایی آرشیو (در صورت وجود)'}
              </label>
              <div className="relative">
                <input
                  type={showExtractPassword ? 'text' : 'password'}
                  value={extractPassword}
                  onChange={(e) => setExtractPassword(e.target.value)}
                  placeholder={isEn ? 'Enter password used when exporting PFX' : 'رمز عبور فایل PFX را وارد کنید'}
                  className={`w-full pr-8 pl-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowExtractPassword(!showExtractPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                >
                  {showExtractPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleExtractPfx}
              disabled={isProcessing || !extractPfxBase64}
              className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                isProcessing || !extractPfxBase64
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : isLightMode
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Extracting Archive Components...' : 'در حال رمزگشایی و استخراج اجزا...'}</span>
                </>
              ) : (
                <>
                  <FolderArchive className="w-4 h-4" />
                  <span>{isEn ? 'Extract Certificate, Key & CA Chain' : 'استخراج گواهی، کلید و زنجیره CA'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Results Section */}
      {outputs.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-slate-700/40">
          {/* Certificate Metadata Banner */}
          {certInfo && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-sm">CN: {certInfo.commonName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      certInfo.isExpired
                        ? 'bg-red-500/20 text-red-400'
                        : certInfo.daysRemaining && certInfo.daysRemaining < 30
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {certInfo.isExpired
                      ? (isEn ? 'Expired' : 'منقضی شده')
                      : `${certInfo.daysRemaining} ${isEn ? 'days remaining' : 'روز معتبر'}`}
                  </span>

                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-mono font-bold">
                    {certInfo.keyType} {certInfo.keyBits}b
                  </span>
                </div>
              </div>

              {/* Key match status */}
              {keyMatch && keyMatch.checked && (
                <div
                  className={`p-2 rounded-lg flex items-center gap-2 text-xs ${
                    keyMatch.matches
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  {keyMatch.matches ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isEn ? keyMatch.messageEn : keyMatch.messageFa}</span>
                </div>
              )}

              {/* Issuer & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="text-slate-400 truncate">
                  <b className="text-slate-300">{isEn ? 'Issuer: ' : 'صادرکننده: '}</b>
                  {certInfo.issuerOrg || certInfo.issuer}
                </div>
                <div className="text-slate-400">
                  <b className="text-slate-300">{isEn ? 'Valid: ' : 'اعتبار: '}</b>
                  {certInfo.validFrom.split(' ')[0]} {isEn ? 'to' : 'تا'} {certInfo.validTo.split(' ')[0]}
                </div>
              </div>

              {/* Fingerprint */}
              {certInfo.sha256Fingerprint && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  <b>SHA-256: </b> {certInfo.sha256Fingerprint}
                </div>
              )}

              {/* SANs */}
              {certInfo.sans && certInfo.sans.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {certInfo.sans.map((san, idx) => (
                    <span
                      key={idx}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        isLightMode
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-slate-950 text-cyan-300 border-slate-800'
                      }`}
                    >
                      {san}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Complete ZIP Suite Download Card */}
          {zipData && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md ${
                isLightMode
                  ? 'bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 border-amber-300'
                  : 'bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-amber-950/40 border-amber-500/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-mono ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                      {zipData.filename}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {zipData.fileCount} {isEn ? 'Files' : 'فایل'} • {Math.round(zipData.sizeBytes / 1024) || 1} KB
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? 'Single unified ZIP package containing all converted formats (.crt, .key, .pfx, .p7b, .cer, chains) + deployment guide README.'
                      : 'بسته فشرده یکپارچه شامل تمام فرمت‌های تبدیل‌شده (CRT، کلید خصوصی، PFX، P7B، زنجیره کامل) به همراه راهنمای نصب.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadZip}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow shrink-0 ${
                  isLightMode
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white'
                    : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>{isEn ? 'Download ZIP Package' : 'دانلود فایل زیپ یکپارچه'}</span>
              </button>
            </div>
          )}

          {/* Formats Header & Download All */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold flex items-center gap-1.5 text-slate-300">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>
                {isEn
                  ? `Generated Formats (${outputs.length} available)`
                  : `فرمت‌های تولیدشده (${outputs.length} فرمت آماده دانلود)`}
              </span>
            </h4>

            <button
              onClick={handleDownloadAll}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                isLightMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isEn ? 'Download All (.ZIP)' : 'دانلود تمامی فایل‌ها (.ZIP)'}</span>
            </button>
          </div>

          {/* Formats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outputs.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-amber-400/60 shadow-sm'
                    : 'bg-slate-900/50 border-slate-800 hover:border-amber-500/40 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        {item.isBinary ? <FolderArchive className="w-3.5 h-3.5" /> : <FileCode className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <h5 className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>{item.format}</h5>
                        <span className="text-[10px] font-mono text-cyan-400">{item.filename}</span>
                      </div>
                    </div>

                    {item.status === 'requires_action' ? (
                      <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>{isEn ? 'Requires Private Key' : 'نیازمند کلید خصوصی'}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/60 shrink-0">
                        {(item.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {isEn ? item.descriptionEn : item.descriptionFa}
                  </p>

                  {/* Target Platforms */}
                  {item.targetPlatforms && item.targetPlatforms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.targetPlatforms.map((plat, pIdx) => (
                        <span
                          key={pIdx}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium"
                        >
                          {plat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Missing Requirement Guidance Box (for PFX or actions requiring key) */}
                  {item.status === 'requires_action' && item.missingRequirements && (
                    <div
                      className={`mt-2.5 p-3 rounded-xl border text-xs space-y-2.5 animate-in fade-in ${
                        isLightMode
                          ? 'bg-amber-50/90 border-amber-300 text-slate-800'
                          : 'bg-amber-950/25 border-amber-500/35 text-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                          <Key className="w-4 h-4" />
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-bold text-xs flex items-center gap-1.5 text-amber-400">
                            <span>{isEn ? 'Why is PFX not generated & What is needed?' : 'علت عدم تولید PFX و پیش‌نیاز مورد نیاز'}</span>
                          </div>
                          <p className="text-[11px] leading-relaxed font-semibold text-amber-500">
                            {isEn ? item.missingRequirements.errorMessageEn : item.missingRequirements.errorMessageFa}
                          </p>
                          <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                            {isEn ? item.missingRequirements.instructionEn : item.missingRequirements.instructionFa}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons inside card */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
                        <button
                          type="button"
                          onClick={() => {
                            setShowKeyField(true);
                            setTimeout(() => {
                              keyTextareaRef.current?.focus();
                              keyTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 100);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                            isLightMode
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
                          }`}
                        >
                          <Key className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Provide Private Key Above' : 'ورود کلید خصوصی در بالا'}</span>
                        </button>

                        {item.missingRequirements.commandExample && (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.missingRequirements?.commandExample) {
                                navigator.clipboard.writeText(item.missingRequirements.commandExample);
                                setCopiedId(`cmd_${item.id}`);
                                setTimeout(() => setCopiedId(null), 2500);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                              copiedId === `cmd_${item.id}`
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : isLightMode
                                ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                            }`}
                            title={isEn ? 'Copy local OpenSSL export command' : 'کپی دستور OpenSSL جهت ساخت در سیستم خود'}
                          >
                            {copiedId === `cmd_${item.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                            <span>{copiedId === `cmd_${item.id}` ? (isEn ? 'Command Copied' : 'دستور کپی شد') : (isEn ? 'Copy OpenSSL Command' : 'کپی دستور OpenSSL')}</span>
                          </button>
                        )}
                      </div>

                      {item.missingRequirements.commandExample && (
                        <div className="pt-1">
                          <div className={`p-2 rounded-lg text-[10px] font-mono select-all overflow-x-auto custom-scrollbar border ${
                            isLightMode ? 'bg-white/90 border-amber-300/60 text-slate-800' : 'bg-slate-950/80 border-amber-500/20 text-cyan-300'
                          }`}>
                            {item.missingRequirements.commandExample}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {item.status === 'requires_action' ? (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Private Key Required for Export' : 'نیازمند کلید متناظر برای ایجاد فایل'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKeyField(true);
                        setTimeout(() => {
                          keyTextareaRef.current?.focus();
                          keyTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                      }}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isLightMode
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      <Key className="w-3 h-3" />
                      <span>{isEn ? 'Enter Key to Generate' : 'ورود کلید و ساخت'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      {!item.isBinary && item.text && (
                        <button
                          onClick={() => handleCopyText(item)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                            copiedId === item.id
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : isLightMode
                              ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                          title={isEn ? 'Copy file text to clipboard' : 'کپی متن فایل'}
                        >
                          {copiedId === item.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === item.id ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                        </button>
                      )}

                      {!item.isBinary && item.text && (
                        <button
                          onClick={() => setPreviewItem(item)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                            isLightMode
                              ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                          title={isEn ? 'Preview content' : 'پیش‌نمایش محتوا'}
                        >
                          <Eye className="w-3 h-3 text-amber-400" />
                          <span>{isEn ? 'Preview' : 'مشاهده'}</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleDownloadItem(item)}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isLightMode
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      <Download className="w-3 h-3" />
                      <span>{isEn ? 'Download' : 'دانلود فایل'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview Modal / Drawer */}
      {previewItem && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl border ${
              isLightMode ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-950 text-slate-100 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold font-mono">{previewItem.filename}</span>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              <pre className="text-[11px] font-mono p-3 rounded-lg bg-black/60 text-slate-200 overflow-x-auto whitespace-pre">
                {previewItem.text}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800">
              <button
                onClick={() => handleCopyText(previewItem)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isEn ? 'Copy to Clipboard' : 'کپی در کلیپ‌بورد'}</span>
              </button>
              <button
                onClick={() => {
                  handleDownloadItem(previewItem);
                  setPreviewItem(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isEn ? 'Download File' : 'دانلود فایل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
