import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function Login() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-sm text-center shadow-md">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileText className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Suseona Docs</h1>
            <p className="text-sm text-muted-foreground">사내 양식 보고서 작성 · DOCX 내보내기</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* /auth/google(Pages Function) → suseona-auth exchange → 복귀 도메인 루트로 fragment 복귀. */}
          <Button
            variant="outline"
            className="w-full gap-3"
            onClick={() => {
              window.location.href = "/auth/google";
            }}
          >
            <GoogleIcon className="size-5" />
            Google로 계속하기
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            로그인 시 Google 계정의 이메일·이름이 인증 서버에서 처리되며, 보고서는 계정 단위로 안전하게 보관됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
