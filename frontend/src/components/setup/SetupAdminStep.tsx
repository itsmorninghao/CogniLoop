import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupApi, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

interface SetupAdminStepProps {
  onComplete: (data: any) => void;
}

export default function SetupAdminStep({ onComplete }: SetupAdminStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    full_name: "",
    password: "",
  });

  const { loginWithToken } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { access_token } = await setupApi.createAdmin({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
      });
      await loginWithToken(access_token);
      setLoading(false);
      setSuccess(true);
      setTimeout(() => onComplete(formData), 1000);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          "Username or email": "该用户名或邮箱已被注册",
          "System is already set up": "系统已完成初始化",
        };
        setError(
          Object.entries(map).find(([k]) => err.message.includes(k))?.[1] || err.message
        );
      } else {
        setError("创建失败，请重试");
      }
    }
  };

  const isFormValid =
    formData.username &&
    formData.email &&
    formData.full_name &&
    formData.password.length >= 8;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center"
          >
            <Check className="w-8 h-8 text-white" />
          </motion.div>
          <h3 className="text-xl font-medium text-foreground mb-1">
            账号创建成功！
          </h3>
          <p className="text-sm text-muted-foreground">已自动登录，正在继续配置...</p>
        </motion.div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-xl font-medium text-foreground mb-1">
              创建管理员账号
            </h2>
            <p className="text-sm text-muted-foreground">
              管理员可以配置系统、管理用户、发布全站广播，之后你可以在后台中添加更多管理员
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="admin"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="admin@example.com"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="full_name">姓名</Label>
              <Input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="管理员"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="password">密码</Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="至少 8 位字符"
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formData.password && formData.password.length < 8 && (
                <p className="text-xs text-amber-500 mt-1">密码长度至少为 8 位</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!isFormValid || loading}
              className="w-full h-10 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium shadow-lg shadow-indigo-500/25 hover:scale-105 active:scale-95 transition-all duration-200 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                "创建管理员并继续"
              )}
            </Button>
          </form>
        </>
      )}
    </motion.div>
  );
}
