import { useState, useRef } from 'react'
import { Camera, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { userApi, type UserPublicInfo } from '@/lib/api'

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
    const fileRef = useRef<HTMLInputElement>(null)

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
