'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import Link from 'next/link';
import { getPromotionProducts, deletePromotionProduct, updatePromotionProduct } from '@/lib/api';

// Backend API types
interface ApiPricingTier {
  id?: number;
  view_count: number;
  points_reward?: number;
  cash_reward?: number;
  product_id?: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  pricing_tiers: ApiPricingTier[];
}

// Frontend component types
interface PricingTier {
  id: number;
  view_count: number;
  points_reward?: number;
  cash_reward?: number;
  reward_amount?: number;
  currency?: string;
}

interface PromotionProduct {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  status: string;
  is_active?: boolean; 
  created_at: string;
  updated_at?: string;
  pricing_tiers: PricingTier[];
}

export default function PromotionProducts() {
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await getPromotionProducts();
      console.log('API response:', data);
      
      // Handle array directly from backend or nested in products property
      const productsData = Array.isArray(data) ? data : (data.products || []);
      
      // Map the API response to our component's data structure
      const mappedProducts = productsData.map(product => ({
        id: product.id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        status: product.is_active ? 'active' : 'inactive',
        is_active: product.is_active,
        created_at: product.created_at,
        updated_at: product.updated_at,
        pricing_tiers: (product.pricing_tiers || []).map((tier: ApiPricingTier) => ({
          id: tier.id || 0,
          view_count: tier.view_count,
          points_reward: tier.points_reward,
          cash_reward: tier.cash_reward,
          reward_amount: tier.points_reward, // Use points_reward as reward_amount
          currency: tier.cash_reward ? 'cash' : 'points'
        }))
      }));
      
      console.log('Mapped products:', mappedProducts);
      setProducts(mappedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: 'Error',
        description: 'Failed to load promotion products',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this promotion product?')) {
      return;
    }
    
    try {
      await deletePromotionProduct(id);
      
      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });
      
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete product',
        variant: 'destructive',
      });
    }
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    try {
      console.log(`Toggling product ${id} from ${currentStatus} to ${currentStatus === 'active' ? 'inactive' : 'active'}`);
      
      // Send is_active flag instead of status string
      const response = await updatePromotionProduct(id, { is_active: currentStatus !== 'active' });
      console.log('Toggle response:', response);
      
      toast({
        title: 'Success',
        description: `Product ${currentStatus === 'active' ? 'deactivated' : 'activated'} successfully`,
      });
      
      fetchProducts();
    } catch (error) {
      console.error('Error updating product status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update product status',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Promotion Products</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProducts}
            disabled={loading}
            className="flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${loading ? 'animate-spin' : ''}`}>
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.7 2.84" />
              <path d="M12 3v9l-2.5-2.5" />
            </svg>
            Refresh
          </Button>
        </div>
        <Button 
          onClick={() => router.push('/dashboard/promotion-products/create')}
          className="flex items-center gap-2 bg-white text-black hover:bg-gray-100"
        >
          <PlusCircle className="w-4 h-4" />
          Add New Product
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <p className="text-muted-foreground">No promotion products found. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 px-6"></TableHead>
                <TableHead className="px-6">Product</TableHead>
                <TableHead className="px-6">Description</TableHead>
                <TableHead className="px-6">Pricing Tiers</TableHead>
                <TableHead className="px-6">Status</TableHead>
                <TableHead className="px-6">Created</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} className="hover:bg-gray-50">
                  <TableCell className="px-6 py-4">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-md border"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-md border flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                          <circle cx="9" cy="9" r="2"/>
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                        </svg>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="font-medium text-gray-900">{product.name}</div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="text-sm text-gray-600 max-w-xs truncate" title={product.description}>
                      {product.description}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="space-y-1">
                      {product.pricing_tiers?.length > 0 ? (
                        <>
                          <div className="text-xs text-gray-500 font-medium">
                            {product.pricing_tiers.length} tier{product.pricing_tiers.length !== 1 ? 's' : ''}
                          </div>
                          {product.pricing_tiers.slice(0, 2).map((tier, index) => (
                            <div key={tier.id || `tier-${tier.view_count}`} className="text-xs text-gray-600">
                              {tier.view_count?.toLocaleString() || '0'} views → {tier.points_reward || tier.reward_amount || tier.cash_reward || 0} {tier.cash_reward ? 'cash' : 'points'}
                            </div>
                          ))}
                          {product.pricing_tiers.length > 2 && (
                            <div className="text-xs text-gray-400">
                              +{product.pricing_tiers.length - 2} more
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">No tiers</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <Badge
                      variant={product.status === 'active' ? 'default' : 'secondary'}
                      className={product.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-800'}
                    >
                      {product.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {new Date(product.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(product.created_at).toLocaleTimeString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(product.id, product.status)}
                        className="h-8 px-3 text-xs"
                      >
                        {product.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => router.push(`/dashboard/promotion-products/${product.id}/edit`)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
