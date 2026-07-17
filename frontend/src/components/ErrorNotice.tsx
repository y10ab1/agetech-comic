import { Icon } from "./Icon";

interface ErrorNoticeProps {
  /** 白話、在地化訊息，嚴禁出現代碼（如 Error 500） */
  message: string;
}

/**
 * 溫度化錯誤提示 —— role="alert" 立即播報；圖示＋大文字並存，不靠純色彩。
 */
export function ErrorNotice({ message }: ErrorNoticeProps) {
  return (
    <div className="notice" role="alert">
      <span className="notice__icon" aria-hidden="true">
        <Icon name="warning" size={36} />
      </span>
      <p className="notice__text">{message}</p>
    </div>
  );
}
