import React, { useState, useEffect } from 'react';
import { X, MapPin, Plus, Trash2, CheckCircle2, Navigation, AlertCircle } from 'lucide-react';
import { Address, User } from '../types';

interface AddressManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSelectAddress?: (address: Address) => void;
  selectable?: boolean;
}

export const AddressManagerModal: React.FC<AddressManagerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectAddress,
  selectable = false,
}) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [houseNo, setHouseNo] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [addressType, setAddressType] = useState<'Home' | 'Work' | 'Other'>('Home');

  const [loading, setLoading] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAddresses();
    }
  }, [isOpen]);

  const fetchAddresses = async () => {
    try {
      const res = await fetch('/api/addresses');
      if (res.ok) {
        const data = await res.json();
        setAddresses(data);
      }
    } catch (err) {
      console.error('Failed to fetch addresses:', err);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(pincode.trim())) {
      setError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          houseNo,
          street,
          landmark,
          city,
          state,
          pincode,
          addressType,
          isDefault: addresses.length === 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAddresses([data.address, ...addresses]);
      setIsAdding(false);
      resetForm();
      if (selectable && onSelectAddress) {
        onSelectAddress(data.address);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/addresses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAddresses(addresses.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete address:', err);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      const res = await fetch(`/api/addresses/default/${id}`, { method: 'POST' });
      if (res.ok) {
        fetchAddresses();
      }
    } catch (err) {
      console.error('Failed to set default address:', err);
    }
  };

  const resetForm = () => {
    setHouseNo('');
    setStreet('');
    setLandmark('');
    setCity('');
    setState('');
    setPincode('');
  };

  // Detect My Location using browser Geolocation + Nominatim Reverse Geocoding
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setGeolocating(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          if (data && data.address) {
            const addr = data.address;
            setStreet(addr.road || addr.suburb || addr.neighbourhood || '');
            setCity(addr.city || addr.town || addr.village || addr.state_district || '');
            setState(addr.state || '');
            setPincode(addr.postcode || '');
            setIsAdding(true);
          } else {
            setError('Could not fetch address details from coordinates.');
          }
        } catch {
          setError('Reverse geocoding service failed. Please enter address manually.');
          setIsAdding(true);
        } finally {
          setGeolocating(false);
        }
      },
      () => {
        setGeolocating(false);
        setError('Location permission denied or unavailable. Please enter address manually.');
        setIsAdding(true);
      },
      { timeout: 10000 }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden my-auto animate-scaleUp flex flex-col max-h-[85vh]">
        <div className="bg-emerald-700 text-white p-5 flex justify-between items-center relative">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            <h2 className="font-bold text-lg">Delivery Addresses</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-emerald-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isAdding ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Add New Address
                </button>
                <button
                  onClick={handleDetectLocation}
                  disabled={geolocating}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-3 rounded-xl text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Navigation className="w-4 h-4 text-emerald-600" /> {geolocating ? 'Detecting...' : 'Detect Location'}
                </button>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No saved delivery addresses. Add one to proceed with checkout.
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                        addr.is_default ? 'bg-emerald-50/50 border-emerald-500 shadow-sm' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{addr.name}</span>
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                              {addr.address_type}
                            </span>
                            {addr.is_default && (
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">
                            {addr.house_no}, {addr.street}{addr.landmark ? `, Landmark: ${addr.landmark}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                          </p>
                          <p className="text-xs text-slate-500">Phone: +91 {addr.phone}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-3">
                          {!addr.is_default && (
                            <button
                              onClick={() => handleSetDefault(addr.id)}
                              className="text-emerald-700 hover:underline font-semibold"
                            >
                              Set as Default
                            </button>
                          )}
                          {selectable && onSelectAddress && (
                            <button
                              onClick={() => {
                                onSelectAddress(addr);
                                onClose();
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold"
                            >
                              Deliver Here
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(addr.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleAddAddress} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">House / Flat No *</label>
                  <input
                    type="text"
                    required
                    value={houseNo}
                    onChange={(e) => setHouseNo(e.target.value)}
                    placeholder="Flat 402, Block B"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="400001"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street & Locality *</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="MG Road, Andheri West"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Landmark</label>
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Near City Mall"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Mumbai"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Maharashtra"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address Type</label>
                <div className="flex gap-4 text-xs font-medium">
                  {(['Home', 'Work', 'Other'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="addressType"
                        checked={addressType === type}
                        onChange={() => setAddressType(type)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors shadow-md"
                >
                  {loading ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
