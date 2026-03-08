import { useState, useRef } from 'react'
import { Camera, X, Check, Link2, Unlink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { userApi, linuxDoApi, type UserPublicInfo } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

interface Props {
    userInfo: UserPublicInfo
    onClose: () => void
    onSaved: (updated: UserPublicInfo) => void
    onAvatarUploaded?: (avatarUrl: string | null) => void
}

export function EditProfileModal({ userInfo, onClose, onSaved, onAvatarUploaded }: Props) {
    const [fullName, setFullName] = useState(userInfo.full_name)
    const [bio, setBio] = useState(userInfo.bio ?? '')
    const [saving, setSaving] = useState(false)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [avatarUrl, setAvatarUrl] = useState(userInfo.avatar_url)
    const [unbinding, setUnbinding] = useState(false)
    const [bindingLinuxDo, setBindingLinuxDo] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const { fetchUser } = useAuthStore()

    const handleSave = async () => {
        if (!fullName.trim()) {
            toast.error('昵称不能为空')
            return
        }
        try {
            setSaving(true)
            const updated = await userApi.updateMe({ full_name: fullName.trim(), bio: bio.trim() })
            onSaved({ ...updated, avatar_url: avatarUrl })
            toast.success('资料已更新')
        } catch {
            toast.error('保存失败')
        } finally {
            setSaving(false)
        }
    }

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            setUploadingAvatar(true)
            const updated = await userApi.uploadAvatar(file)
            setAvatarUrl(updated.avatar_url)
            onAvatarUploaded?.(updated.avatar_url)
            toast.success('头像已更新')
        } catch {
            toast.error('头像上传失败')
        } finally {
            setUploadingAvatar(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">编辑个人资料</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition">
                        <X className="size-5" />
                    </button>
                </div>

                <div className="mb-5 flex flex-col items-center gap-3">
                    <div className="relative">
                        <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-bold text-white">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="avatar" className="size-full object-cover" />
                            ) : (
                                userInfo.full_name.charAt(0)
                            )}
                        </div>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-white hover:opacity-90 transition disabled:opacity-50"
                        >
                            {uploadingAvatar ? (
                                <div className="size-3 animate-spin rounded-full border border-white border-t-transparent" />
                            ) : (
                                <Camera className="size-3.5" />
                            )}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>
                    <p className="text-xs text-muted-foreground">点击相机图标更换头像</p>
                </div>

                <div className="mb-4">
                    <label className="mb-1.5 block text-sm font-medium text-foreground">用户名</label>
                    <input
                        value={userInfo.username}
                        disabled
                        className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">用户名注册后不可更改</p>
                </div>

                <div className="mb-4">
                    <label className="mb-1.5 block text-sm font-medium text-foreground">昵称</label>
                    <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={100}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                    />
                </div>

                <div className="mb-6">
                    <label className="mb-1.5 block text-sm font-medium text-foreground">个人简介</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="介绍一下自己..."
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                    />
                </div>

                {/* Third-party accounts */}
                <div className="mb-6 rounded-lg border border-border p-4">
                    <p className="mb-3 text-sm font-medium text-foreground">第三方账号</p>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-7 items-center justify-center rounded-full bg-[#00aeef]/10">
                                <Link2 className="size-3.5 text-[#00aeef]" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">Linux DO</p>
                                {userInfo.linux_do_id
                                    ? <p className="text-xs text-muted-foreground">已绑定（ID: {userInfo.linux_do_id}）</p>
                                    : <p className="text-xs text-muted-foreground">未绑定</p>
                                }
                            </div>
                        </div>
                        {userInfo.linux_do_id ? (
                            <button
                                type="button"
                                disabled={unbinding}
                                onClick={async () => {
                                    try {
                                        setUnbinding(true)
                                        await linuxDoApi.unbind()
                                        await fetchUser()
                                        toast.success('已解除 Linux DO 绑定')
                                        onClose()
                                    } catch (err) {
                                        toast.error(err instanceof Error ? err.message : '解绑失败')
                                    } finally {
                                        setUnbinding(false)
                                    }
                                }}
                                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition disabled:opacity-50"
                            >
                                {unbinding ? <Loader2 className="size-3 animate-spin" /> : <Unlink className="size-3" />}
                                解除关联
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={bindingLinuxDo}
                                onClick={async () => {
                                    try {
                                        setBindingLinuxDo(true)
                                        sessionStorage.setItem('linux_do_flow', 'bind')
                                        const { url } = await linuxDoApi.getBindUrl()
                                        window.location.href = url
                                    } catch (err) {
                                        toast.error(err instanceof Error ? err.message : '跳转失败')
                                        setBindingLinuxDo(false)
                                    }
                                }}
                                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition disabled:opacity-50"
                            >
                                {bindingLinuxDo ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                                关联 Linux DO
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
                    >
                        {saving ? (
                            <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                            <Check className="size-4" />
                        )}
                        保存
                    </button>
                </div>
            </div>
        </div>
    )
}
