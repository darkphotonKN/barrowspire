'use client';

import { useEffect } from 'react';
import { startSessionRenewal } from '@/utils/api';

/**
 * Renews the access token shortly before it expires, for as long as the app is open
 * (FS-ZPX58 R18). Renders nothing; mounted once in the root layout.
 */
export default function SessionRenewal() {
  useEffect(() => startSessionRenewal(), []);
  return null;
}
