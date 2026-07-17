import { AmiCat } from "./AmiCat";

interface CharacterStageProps {
  name: string;
  /** 閒置引導：貓咪呼吸變明顯 */
  idle?: boolean;
}

/**
 * 陪伴員舞台 —— 會呼吸的阿咪貓臉＋名字標籤。
 * 貓臉為裝飾（aria-hidden），語意由旁邊的文字承載。
 */
export function CharacterStage({ name, idle = false }: CharacterStageProps) {
  return (
    <div className="flex items-center gap-5">
      <AmiCat size={112} idle={idle} decorative />
      <div>
        <p className="m-0 text-[24px] font-bold">{name}</p>
        <p className="m-0 text-[20px] text-[color:var(--color-text-soft)]">
          AI 說書人
        </p>
      </div>
    </div>
  );
}
