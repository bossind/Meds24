export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  category_name?: string;
  name: string;
  slug: string;
  brand: string;
  description: string;
  manufacturer?: string;
  composition?: string;
  storage_instructions?: string;
  mrp: number;
  price: number;
  discount_percent: number;
  image_url: string;
  requires_prescription: boolean;
  stock: number;
  unit: string;
  is_active: boolean;
  created_at: string;
}

export interface CartItem {
  id?: number;
  product_id?: number;
  product: Product;
  quantity: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'admin';
  is_verified?: boolean;
  referral_code?: string;
  created_at?: string;
}

export interface Address {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  house_no: string;
  street: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  address_type: 'Home' | 'Work' | 'Other';
  is_default: boolean;
}

export interface PaymentSetting {
  id: number;
  method_code: string;
  method_name: string;
  is_enabled: boolean;
  min_order_amount: number;
  max_order_amount: number;
  fee: number;
  discount_percent: number;
  advance_percent: number;
  merchant_upi_id: string;
  merchant_name: string;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  address_snapshot?: string;
  mrp_total: number;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: string;
  payment_status: 'Awaiting Payment' | 'Proof Submitted' | 'Verification Pending' | 'Approved' | 'Rejected' | 'Expired' | 'Refund Pending' | 'Refunded';
  amount_paid: number;
  remaining_balance: number;
  status: 'Pending' | 'Confirmed' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  prescription_url?: string;
  created_at: string;
}
