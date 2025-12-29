'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Minus, ArrowLeft, Link, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { getPromotionProduct, updatePromotionProduct } from '@/lib/api';

interface PricingTier {
  id?: number;
  view_count: number;
  points_reward?: number;
  cash_reward?: number;
}

interface PromotionProduct {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  product_link?: string | null | undefined;
  is_active: boolean;
  pricing_tiers: PricingTier[];
}

export default function EditPromotionProduct() {
  const params = useParams();
  const productId = parseInt(params.id as string, 10);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [productLink, setProductLink] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalProduct, setOriginalProduct] = useState<PromotionProduct | null>(null);
  
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await getPromotionProduct(productId);
      const product = response.product;
      
      setOriginalProduct(product);
      setName(product.name);
      setDescription(product.description || '');
      setImageUrl(product.image_url || '');
      setProductLink(product.product_link || '');
      setIsActive(product.is_active);
      
      // Map pricing tiers
      const tiers = (product.pricing_tiers || []).map(tier => ({
        id: tier.id,
        view_count: tier.view_count,
        points_reward: tier.points_reward || tier.cash_reward || 0,
        cash_reward: tier.cash_reward
      }));
      
      setPricingTiers(tiers.length > 0 ? tiers : [{ view_count: 1000, points_reward: 100 }]);
    } catch (error) {
      console.error('Error fetching product:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to load promotion product',
        variant: 'destructive'
      });
      router.push('/dashboard/promotion-products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTier = () => {
    setPricingTiers([...pricingTiers, { view_count: 0, points_reward: 0 }]);
  };

  const handleRemoveTier = (index: number) => {
    if (pricingTiers.length > 1) {
      setPricingTiers(pricingTiers.filter((_, i) => i !== index));
    } else {
      toast({ 
        title: 'Error', 
        description: 'At least one pricing tier is required',
        variant: 'destructive'
      });
    }
  };

  const handleTierChange = (index: number, field: 'view_count' | 'points_reward', value: number) => {
    const updatedTiers = [...pricingTiers];
    updatedTiers[index][field] = value;
    setPricingTiers(updatedTiers);
  };

  const hasChanges = () => {
    if (!originalProduct) return false;
    
    return (
      name !== originalProduct.name ||
      description !== (originalProduct.description || '') ||
      imageUrl !== (originalProduct.image_url || '') ||
      productLink !== (originalProduct.product_link || '') ||
      isActive !== originalProduct.is_active ||
      JSON.stringify(pricingTiers) !== JSON.stringify(originalProduct.pricing_tiers)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!name.trim()) {
      toast({ 
        title: 'Error', 
        description: 'Product name is required',
        variant: 'destructive'
      });
      return;
    }
    
    if (pricingTiers.some(tier => tier.view_count <= 0 || (tier.points_reward || 0) <= 0)) {
      toast({ 
        title: 'Error', 
        description: 'All pricing tiers must have view count and reward amount greater than 0',
        variant: 'destructive'
      });
      return;
    }
    
    if (!hasChanges()) {
      toast({ 
        title: 'Info', 
        description: 'No changes detected'
      });
      return;
    }
    
    setSaving(true);
    
    try {
      const updateData = {
        name,
        description,
        image_url: imageUrl || null,
        product_link: productLink || undefined,
        is_active: isActive,
        pricing_tiers: pricingTiers.map(tier => ({
          id: tier.id,
          view_count: tier.view_count,
          points_reward: tier.points_reward ?? 0,
          cash_reward: tier.cash_reward
        })),
      };

      await updatePromotionProduct(productId, updateData);
      
      toast({ 
        title: 'Success', 
        description: 'Promotion product updated successfully'
      });
      
      router.push('/dashboard/promotion-products');
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update promotion product',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <Button 
        variant="ghost" 
        className="mb-6 flex items-center gap-2 bg-white text-black hover:bg-gray-100"
        onClick={() => router.push('/dashboard/promotion-products')}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </Button>
      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Edit Promotion Product</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="active-switch" className="text-sm text-gray-600">
                Status
              </Label>
              <Switch
                id="active-switch"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <span className="text-sm text-gray-600">
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Product Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Premium Video Promotion"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the promotion product..."
                rows={4}
              />
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              {imageUrl && (
                <div className="mt-2 p-2 border rounded-lg">
                  <img 
                    src={imageUrl} 
                    alt="Product preview" 
                    className="max-h-32 object-cover rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            {/* Product Link */}
            <div className="space-y-2">
              <Label htmlFor="productLink">
                <Link className="w-4 h-4 inline mr-2" />
                Product Link
              </Label>
              <Input
                id="productLink"
                type="url"
                value={productLink}
                onChange={(e) => setProductLink(e.target.value)}
                placeholder="https://example.com/product"
              />
            </div>

            {/* Pricing Tiers */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Pricing Tiers *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTier}
                  className="flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add Tier
                </Button>
              </div>

              <div className="space-y-3">
                {pricingTiers.map((tier, index) => (
                  <div key={index} className="flex gap-3 items-start p-4 border rounded-lg bg-gray-50">
                    <div className="flex-1">
                      <Label htmlFor={`views-${index}`} className="text-sm">
                        View Count
                      </Label>
                      <Input
                        id={`views-${index}`}
                        type="number"
                        min="1"
                        value={tier.view_count}
                        onChange={(e) => handleTierChange(index, 'view_count', parseInt(e.target.value) || 0)}
                        placeholder="1000"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`reward-${index}`} className="text-sm">
                        Points Reward
                      </Label>
                      <Input
                        id={`reward-${index}`}
                        type="number"
                        min="1"
                        value={tier.points_reward}
                        onChange={(e) => handleTierChange(index, 'points_reward', parseInt(e.target.value) || 0)}
                        placeholder="100"
                        required
                      />
                    </div>
                    {pricingTiers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTier(index)}
                        className="mt-6"
                      >
                        <Minus className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard/promotion-products')}
                disabled={saving}
              >
                Cancel
              </Button>
                <Button 
                type="submit" 
                disabled={saving || !hasChanges()}
                className="min-w-[120px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:from-blue-600 hover:to-pink-600 transition-all duration-200"
                >
                {saving ? (
                  <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}