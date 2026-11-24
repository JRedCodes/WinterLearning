export interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

/** A controlled search box. It owns no state: its parent does (lifting state up). */
export function FilterInput({ value, onChange }: FilterInputProps) {
  return (
    <label className="filter">
      Filter cards
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
