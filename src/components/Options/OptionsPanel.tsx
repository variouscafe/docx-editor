import { useState, useEffect } from "react";
import type { DocxOptions } from "../../types/options";

interface OptionsPanelProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

export default function OptionsPanel({
  options,
  onOptionsChange,
}: OptionsPanelProps) {
  const [jsonText, setJsonText] = useState(JSON.stringify(options, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(options, null, 2));
    setError(null);
  }, [options]);

  const handleChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      setError(null);
      onOptionsChange(parsed as DocxOptions);
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Options (JSON)</h3>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
      <textarea
        className="flex-1 p-3 text-xs font-mono resize-none outline-none border-none"
        value={jsonText}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
