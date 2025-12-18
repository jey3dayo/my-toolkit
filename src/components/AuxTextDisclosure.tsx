type Props = {
  summary: string;
  text: string;
  defaultOpen?: boolean;
};

export function AuxTextDisclosure(props: Props): React.JSX.Element | null {
  const trimmed = props.text.trim();
  if (!trimmed) return null;

  return (
    <details className="mbu-overlay-aux" open={props.defaultOpen}>
      <summary className="mbu-overlay-aux-summary">{props.summary}</summary>
      <blockquote className="mbu-overlay-quote">{trimmed}</blockquote>
    </details>
  );
}
