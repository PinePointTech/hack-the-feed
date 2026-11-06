"use client";
import { QRCodeSVG } from "qrcode.react";

// Hex, not CSS vars: the SVG fill attributes need literal colors. ink on paper.
export function Qr({ url, size = 256 }: { url: string; size?: number }) {
  return <QRCodeSVG value={url} size={size} fgColor="#15171a" bgColor="#f2f4f1" />;
}
