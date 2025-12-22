import { Button } from "@base-ui/react/button";

type Props = {
  title: string;
  value: string;
  canCopy: boolean;
  onCopy: () => void;
};

export function ActionOutputPanel(props: Props): React.JSX.Element {
  return (
    <section className="output-panel">
      <div className="row-between">
        <div className="meta-title">{props.title}</div>
        <div className="button-row">
          <Button
            className="btn btn-ghost btn-small"
            data-testid="copy-output"
            disabled={!props.canCopy}
            onClick={() => {
              props.onCopy();
            }}
            type="button"
          >
            コピー
          </Button>
        </div>
      </div>
      <textarea
        className="summary-output summary-output--sm"
        data-testid="action-output"
        readOnly
        value={props.value}
      />
    </section>
  );
}
