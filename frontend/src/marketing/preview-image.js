import React from 'react';

// Only used by the isolated visual preview. Canonical source uses next/image.
export default function PreviewImage({ priority, alt, ...props }) {
  return <img alt={alt} loading={priority ? 'eager' : 'lazy'} {...props} />;
}