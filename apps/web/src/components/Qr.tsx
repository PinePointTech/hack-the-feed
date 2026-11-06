"use client";
import { QRCodeSVG } from "qrcode.react";

export function Qr({ url, size = 256 }: { url: string; size?: number }) {
  return <QRCodeSVG value={url} size={size} />;
}
