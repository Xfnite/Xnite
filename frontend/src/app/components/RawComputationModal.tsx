import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calculator } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RawComputationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, any> | null;
  totalAmount?: number;
  isProcessing?: boolean;
}

export default function RawComputationModal({ isOpen, onClose, data, totalAmount, isProcessing }: RawComputationModalProps) {
  // Try to parse stringified JSON if it comes in as a string
  let parsedData: Record<string, any> = {};
  if (data) {
    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        console.error("Failed to parse raw computation:", e);
      }
    } else {
      parsedData = data;
    }
  }

  const keys = Object.keys(parsedData);
  
  // Design Theory: Visual Hierarchy - Extract the final total to emphasize it at the bottom
  const finalKey = keys.find(k => k.toLowerCase().includes('final'));
  // Extract hours to emphasize at the top
  const hoursKey = keys.find(k => k.toLowerCase().includes('hour'));
  
  // Extract custom notes (e.g. _note1, _note2, _note3)
  const noteKeys = keys.filter(k => k.startsWith('_note'));
  const notes = noteKeys.map(k => parsedData[k]).filter(v => typeof v === 'string' && v.trim() !== '');

  let regularKeys = keys.filter(k => k !== finalKey && k !== hoursKey && !k.startsWith('_note') && !k.toLowerCase().includes('tlcalc'));

  // Move True Value to the bottom of the regular keys list
  const trueValueIndex = regularKeys.findIndex(k => k.toLowerCase().includes('true value'));
  if (trueValueIndex !== -1) {
    const [trueValueKey] = regularKeys.splice(trueValueIndex, 1);
    
    // Ensure True Value appears on the left column (even index)
    if (regularKeys.length % 2 !== 0) {
      regularKeys.push('_dummy_placeholder');
    }
    
    regularKeys.push(trueValueKey);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl w-[90vw] bg-white dark:bg-[#1A232C] border-black/10 dark:border-white/10 shadow-2xl z-[100] p-0 overflow-hidden">
        <DialogHeader className="px-8 py-5 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
          <DialogTitle className="flex items-center gap-3 text-xl font-black text-[#0D1B2A] dark:text-white tracking-tight">
            <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 flex items-center justify-center ring-4 ring-[#1F7A1F]/5 dark:ring-[#55f761]/5">
              <Calculator className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761]" />
            </div>
            Computation Details
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] w-full">
          <div className="p-8">
          {keys.length > 0 ? (
            <div className="flex flex-col">
              {/* Dynamic Notes / Badges */}
              {notes.length > 0 && (
                <div className="mb-6 flex flex-col gap-2">
                  {notes.map((note, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 bg-yellow-500/10 dark:bg-yellow-400/10 border border-yellow-500/20 dark:border-yellow-400/20 rounded-xl p-3.5">
                      <div className="mt-0.5 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center text-[#060D14] shrink-0 font-bold text-[10px]">!</div>
                      <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300/90 leading-tight">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Highlighted Hours Section at the Top */}
              {hoursKey && (
                <div className="mb-6 pb-6 border-b-2 border-dashed border-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center bg-blue-500/5 dark:bg-blue-400/5 p-4 rounded-2xl border border-blue-500/10 dark:border-blue-400/10">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                      Total {hoursKey.replace(/:$/, '')} Worked
                    </span>
                    <span className="text-2xl font-black text-[#0D1B2A] dark:text-white">
                      {typeof parsedData[hoursKey] === 'number' 
                        ? parsedData[hoursKey].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : String(parsedData[hoursKey])}
                    </span>
                  </div>
                </div>
              )}

              <div className="w-full">
                <div className="grid grid-cols-2 gap-x-12 gap-y-1">
                  {regularKeys.map((key, index) => {
                    if (key === '_dummy_placeholder') return <div key={index} aria-hidden="true" />;
                    
                    const value = parsedData[key];
                    const keyLower = key.toLowerCase();

                    // Hide TLCalc since it's a hidden column in their sheet
                    if (keyLower.includes('tlcalc')) return null;

                    // Processing, platform fee, worktime quota, admin, and management fees are deductions
                    const isDeduction = keyLower.includes('admin') || keyLower.includes('management') || 
                                        keyLower.includes('processing') || keyLower.includes('platform fee') || 
                                        keyLower.includes('worktime quota');
                    const isNegative = (typeof value === 'number' && value < 0) || isDeduction;
                    
                    // Determine if the value is a currency or just a metric/count
                    // Removed 'quota', 'unclaimed', 'tlcalc' so they correctly show as Peso (TLCalc is hidden anyway)
                    const nonCurrencyKeywords = ['hour', 'run', 'filter', 'yield', 'benchmark'];
                    const isCurrency = typeof value === 'number' && !nonCurrencyKeywords.some(kw => keyLower.includes(kw));

                    const formattedValue = typeof value === 'number' 
                      ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : String(value);

                    return (
                      <div 
                        key={index} 
                        className="flex justify-between items-center py-2.5 border-b border-black-[0.03] dark:border-white-[0.03] hover:bg-black/[0.01] dark:hover:bg-white/[0.01] px-2 rounded-lg transition-colors"
                      >
                        <span className="text-sm font-semibold text-[#2F3E46]/80 dark:text-white/70 tracking-wide">
                          {(() => {
                            const rawKey = key.replace(/:$/, '');
                            const lower = rawKey.toLowerCase();
                            if (lower.includes('admin fee')) return rawKey.replace(/admin fee/i, 'Processing Fee');
                            if (lower.includes('admin')) return rawKey.replace(/admin/i, 'Processing');
                            if (lower.includes('management fee')) return rawKey.replace(/management fee/i, 'Platform Fee');
                            if (lower.includes('management')) return rawKey.replace(/management/i, 'Platform');
                            return rawKey;
                          })()}
                        </span>
                        <span className={`text-sm font-black ${
                          isNegative 
                            ? 'text-red-500/90 dark:text-red-400/90' 
                            : 'text-[#0D1B2A] dark:text-white/90'
                        }`}>
                          {isProcessing ? (
                            <span className="text-orange-500 dark:text-orange-400">Processing...</span>
                          ) : (
                            <>
                              {isCurrency ? (isNegative && value > 0 ? '-₱' : '₱') : ''}
                              {formattedValue}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Design Theory: Gestalt Principle of Separation & Emphasis */}
              {finalKey && (
                <div className="mt-6 pt-6 border-t-2 border-dashed border-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 p-5 rounded-2xl border border-[#1F7A1F]/10 dark:border-[#55f761]/10">
                    <span className="text-base font-black text-[#1F7A1F] dark:text-[#55f761] uppercase tracking-widest">
                      {finalKey.replace(/:$/, '')}
                    </span>
                    <span className="text-3xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                      {isProcessing ? (
                        <span className="text-orange-500 dark:text-orange-400 text-2xl">Processing...</span>
                      ) : (
                        <>
                          ₱{typeof totalAmount === 'number'
                            ? totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : (typeof parsedData[finalKey] === 'number' 
                              ? parsedData[finalKey].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : String(parsedData[finalKey]))}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <Calculator className="w-12 h-12 text-black/10 dark:text-white/10 mb-3" />
              <p className="text-sm text-[#2F3E46]/60 dark:text-white/40 font-medium">No computation data available.</p>
            </div>
          )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-8 py-5 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
