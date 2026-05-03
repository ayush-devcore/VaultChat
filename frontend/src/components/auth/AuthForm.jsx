import { useState } from 'react';
import BrutalButton from '../ui/BrutalButton';
import BrutalInput from '../ui/BrutalInput';
import BrutalCard from '../ui/BrutalCard';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';

/**
 * AuthForm — Combined Login/Register form with Neo-Brutalist styling.
 */
export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    avatarBase64: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const { login } = useAuth();

  const validate = () => {
    const errs = {};
    if (!formData.username.trim()) errs.username = 'Username is required';
    else if (formData.username.length < 3) errs.username = 'Min 3 characters';
    if (!formData.password) errs.password = 'Password is required';
    else if (formData.password.length < 8) errs.password = 'Min 8 characters';
    if (!isLogin && formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const payload = {
        username: formData.username,
        password: formData.password,
      };
      
      if (!isLogin && formData.avatarBase64) {
        payload.avatar_base64 = formData.avatarBase64;
      }

      const endpoint = isLogin ? `${API_BASE_URL}/auth/login` : `${API_BASE_URL}/auth/register`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        let errorMsg = 'Something went wrong';
        if (Array.isArray(data.detail)) {
          errorMsg = data.detail[0]?.msg || 'Invalid input format';
        } else if (data.detail) {
          errorMsg = data.detail;
        }
        setServerError(String(errorMsg));
        return;
      }

      await login(
        { id: data.user_id, username: data.username, avatar_base64: data.avatar_base64 },
        data.access_token
      );
    } catch (err) {
      // Extract the specific message from FastAPI's 422 error (if axios was used) or fallback to fetch error
      const message = err.response?.data?.detail?.[0]?.msg || 
                      err.response?.data?.detail || 
                      err?.message ||
                      "Registration failed. Please check your inputs.";
      setServerError(String(message)); // ✅ Force it to be a string to prevent crashing
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG to keep size small
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setFormData((prev) => ({ ...prev, avatarBase64: dataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <BrutalCard
      shadow="lg"
      className="w-full max-w-md animate-[fadeIn_0.4s_ease-out]"
    >
      {/* Tab Switcher */}
      <div className="flex border-b-3 border-vault-black mb-6">
        <button
          type="button"
          onClick={() => { setIsLogin(true); setErrors({}); setServerError(''); }}
          className={`
            flex-1 py-3 font-display font-bold text-sm uppercase tracking-wider
            border-b-4 transition-colors cursor-pointer
            ${isLogin
              ? 'border-vault-yellow bg-vault-yellow text-vault-black'
              : 'border-transparent text-vault-darkgray hover:text-vault-black'
            }
          `}
        >
          🔑 Login
        </button>
        <button
          type="button"
          onClick={() => { setIsLogin(false); setErrors({}); setServerError(''); }}
          className={`
            flex-1 py-3 font-display font-bold text-sm uppercase tracking-wider
            border-b-4 transition-colors cursor-pointer
            ${!isLogin
              ? 'border-vault-pink bg-vault-pink text-vault-black'
              : 'border-transparent text-vault-darkgray hover:text-vault-black'
            }
          `}
        >
          ✦ Register
        </button>
      </div>

      {/* Server Error */}
      {serverError && (
        <div className="bg-vault-red text-white border-3 border-vault-black p-3 mb-4 font-bold text-sm uppercase tracking-wide animate-[shake_0.3s_ease]">
          ⚠ {serverError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <BrutalInput
          id="auth-username"
          label="Username"
          placeholder="Enter your handle..."
          value={formData.username}
          onChange={handleChange('username')}
          error={errors.username}
          icon="👤"
          autoComplete="username"
        />

        <BrutalInput
          id="auth-password"
          label="Password"
          type="password"
          placeholder="Enter password..."
          value={formData.password}
          onChange={handleChange('password')}
          error={errors.password}
          icon="🔒"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
        />

        {!isLogin && (
          <div className="animate-[fadeIn_0.3s_ease-out] flex flex-col gap-5">
            <BrutalInput
              id="auth-confirm-password"
              label="Confirm Password"
              type="password"
              placeholder="Confirm password..."
              value={formData.confirmPassword}
              onChange={handleChange('confirmPassword')}
              error={errors.confirmPassword}
              icon="🔒"
              autoComplete="new-password"
            />
            
            <div className="flex items-center gap-4 border-3 border-vault-black bg-vault-offwhite p-3 shadow-[2px_2px_0px_#0A0A0A]">
              <div className="w-12 h-12 flex-shrink-0 bg-vault-gray border-2 border-vault-black flex items-center justify-center overflow-hidden">
                {formData.avatarBase64 ? (
                  <img src={formData.avatarBase64} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">👤</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold font-display uppercase mb-1">Profile Picture (Optional)</p>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarSelect}
                  className="text-[10px] font-mono w-full file:mr-2 file:py-1 file:px-2 file:border-2 file:border-vault-black file:bg-vault-yellow file:text-vault-black file:font-bold file:cursor-pointer hover:file:bg-vault-pink transition-colors"
                />
              </div>
            </div>
          </div>
        )}

        <BrutalButton
          type="submit"
          variant={isLogin ? 'yellow' : 'pink'}
          size="lg"
          fullWidth
          loading={loading}
        >
          {isLogin ? '→ Enter the Vault' : '✦ Create Account'}
        </BrutalButton>
      </form>

      {/* Security Notice */}
      <div className="mt-6 pt-4 border-t-3 border-vault-black">
        <p className="text-xs text-vault-darkgray font-mono text-center leading-relaxed">
          🛡️ End-to-end encrypted • Keys generated locally
          <br />
          The server <span className="font-bold text-vault-black">never</span> sees your messages
        </p>
      </div>
    </BrutalCard>
  );
}
