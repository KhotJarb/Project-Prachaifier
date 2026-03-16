import { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Image as ImageIcon, Zap, Loader2, Download, AlertCircle } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const resizeToExactDimensions = (src: string, width: number, height: number, mimeType: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(src);
        return;
      }
      
      const imgRatio = img.width / img.height;
      const targetRatio = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      if (imgRatio > targetRatio) {
        drawWidth = height * imgRatio;
        offsetX = (width - drawWidth) / 2;
      } else {
        drawHeight = width / imgRatio;
        offsetY = (height - drawHeight) / 2;
      }

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      resolve(canvas.toDataURL(mimeType));
    };
    img.onerror = reject;
    img.src = src;
  });
};

export default function App() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [targetImage, setTargetImage] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>('');
  const [targetMime, setTargetMime] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetDimensions, setTargetDimensions] = useState<{width: number, height: number} | null>(null);

  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'source' | 'target') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (type === 'source') {
        setSourceImage(base64String);
        setSourceMime(file.type);
      } else {
        setTargetImage(base64String);
        setTargetMime(file.type);
        
        const img = new Image();
        img.onload = () => {
          setTargetDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.src = base64String;
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePrachaify = async () => {
    if (!sourceImage || !targetImage) {
      setError("PIT STOP REQUIRED: Please upload both source and target images.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResultImage(null);

    try {
      const sourceBase64Data = sourceImage.split(',')[1];
      const targetBase64Data = targetImage.split(',')[1];

      let aspectRatio = "1:1";
      if (targetDimensions) {
        const ratio = targetDimensions.width / targetDimensions.height;
        const ratios = [
          { name: "1:1", val: 1 },
          { name: "4:3", val: 4/3 },
          { name: "3:4", val: 3/4 },
          { name: "16:9", val: 16/9 },
          { name: "9:16", val: 9/16 }
        ];
        let closest = ratios[0];
        let minDiff = Math.abs(ratio - closest.val);
        for (const r of ratios) {
          const diff = Math.abs(ratio - r.val);
          if (diff < minDiff) {
            minDiff = diff;
            closest = r;
          }
        }
        aspectRatio = closest.name;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: targetBase64Data,
                mimeType: targetMime,
              },
            },
            {
              inlineData: {
                data: sourceBase64Data,
                mimeType: sourceMime,
              },
            },
            {
              text: "Edit the first image. Replace the face of the person in the first image with the face of the person in the second image. Keep the original pose, lighting, background, and clothing of the first image exactly the same. Only change the facial features.",
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          }
        }
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          
          if (targetDimensions) {
            const exactImage = await resizeToExactDimensions(imageUrl, targetDimensions.width, targetDimensions.height, targetMime);
            setResultImage(exactImage);
          } else {
            setResultImage(imageUrl);
          }
          
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error("ENGINE FAILURE: No image was generated. Please try again.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "CRASH: An error occurred during processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#15151E] text-white p-4 md:p-8 font-sans selection:bg-[#E10600] selection:text-white">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-12 border-b-4 border-[#E10600] pb-6 flex items-end justify-between">
        <div>
          <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase">
            Pracha<span className="text-[#E10600]">ifier</span>
          </h1>
          <p className="text-gray-400 font-medium tracking-widest uppercase text-sm mt-2">
            Facial Feature Transfer Engine
          </p>
        </div>
        <div className="hidden md:flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-4 h-12 bg-[#E10600] skew-x-[-20deg] opacity-80"></div>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-6">
          {/* Source Image */}
          <div className="bg-[#1E1E28] p-1 rounded-xl border border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#E10600]"></div>
            <div className="p-5">
              <h2 className="text-xl font-bold uppercase italic mb-4 flex items-center gap-2">
                <span className="bg-white text-black w-6 h-6 flex items-center justify-center rounded-full text-sm">1</span>
                Source Face
              </h2>
              <p className="text-xs text-gray-400 mb-3">Upload the face you want to use (e.g., Pracha).</p>
              <div 
                className="border-2 border-dashed border-gray-600 hover:border-[#E10600] transition-colors rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden bg-black/30"
                onClick={() => sourceInputRef.current?.click()}
              >
                {sourceImage ? (
                  <img src={sourceImage} alt="Source" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-400 font-medium uppercase tracking-wider">Select Source</span>
                  </>
                )}
                <input 
                  type="file" 
                  ref={sourceInputRef} 
                  onChange={(e) => handleImageUpload(e, 'source')} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>
          </div>

          {/* Target Image */}
          <div className="bg-[#1E1E28] p-1 rounded-xl border border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-white"></div>
            <div className="p-5">
              <h2 className="text-xl font-bold uppercase italic mb-4 flex items-center gap-2">
                <span className="bg-[#E10600] text-white w-6 h-6 flex items-center justify-center rounded-full text-sm">2</span>
                Target Image
              </h2>
              <p className="text-xs text-gray-400 mb-3">Upload the image you want to modify.</p>
              <div 
                className="border-2 border-dashed border-gray-600 hover:border-white transition-colors rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden bg-black/30"
                onClick={() => targetInputRef.current?.click()}
              >
                {targetImage ? (
                  <img src={targetImage} alt="Target" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-400 font-medium uppercase tracking-wider">Select Target</span>
                  </>
                )}
                <input 
                  type="file" 
                  ref={targetInputRef} 
                  onChange={(e) => handleImageUpload(e, 'target')} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handlePrachaify}
            disabled={isProcessing || !sourceImage || !targetImage}
            className="w-full bg-[#E10600] hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-black text-2xl italic uppercase py-6 px-8 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(225,6,0,0.3)] disabled:shadow-none"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="w-8 h-8 fill-current" />
                Start Engine
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Result */}
        <div className="lg:col-span-8">
          <div className="bg-[#1E1E28] rounded-xl border border-gray-800 h-full min-h-[500px] flex flex-col relative overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-black/20">
              <h2 className="text-lg font-bold uppercase tracking-widest text-gray-400">Telemetry / Output</h2>
              {resultImage && (
                <a 
                  href={resultImage} 
                  download="prachaified.png"
                  className="text-xs font-bold uppercase tracking-wider bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export
                </a>
              )}
            </div>
            
            <div className="flex-1 p-6 flex items-center justify-center relative">
              {/* Grid background */}
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50"></div>
              
              {isProcessing ? (
                <div className="text-center relative z-10">
                  <div className="w-24 h-24 border-4 border-gray-800 border-t-[#E10600] rounded-full animate-spin mx-auto mb-6"></div>
                  <p className="text-[#E10600] font-bold uppercase tracking-widest animate-pulse">Computing Aerodynamics...</p>
                </div>
              ) : resultImage ? (
                <img 
                  src={resultImage} 
                  alt="Result" 
                  className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl relative z-10 border border-gray-700"
                />
              ) : (
                <div className="text-center text-gray-600 relative z-10">
                  <Zap className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="font-medium uppercase tracking-widest text-sm">Awaiting Input Data</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
