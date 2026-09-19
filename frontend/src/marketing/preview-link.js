import React from 'react';

// Only used by the isolated visual preview. Canonical source uses next/link.
export default function PreviewLink({ children, href, ...props }) {
  return <a href={href} {...props}>{children}</a>;
}