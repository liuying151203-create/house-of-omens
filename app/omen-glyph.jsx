export default function OmenGlyph({ size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.8 5.6 18 5a5.1 5.1 0 0 0-4-2.5l.7 1.4a5.5 5.5 0 0 0-3.6 2.2C8 5.5 5.5 6 3 7.4c2.4.2 4.2 1 5.2 2.2-2.4.3-4.4 1.4-6.2 3.3l5.8-1a7.8 7.8 0 0 0 4.3 4.2v2.4H9.8l-.8 1h5.2l-.8-1h-.2v-2.1c3.2.4 5.1-2.1 5-5.7l3.6-2-3.6-1.3 3.6-1.8ZM16 6.7a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4Z" />
    </svg>
  );
}
