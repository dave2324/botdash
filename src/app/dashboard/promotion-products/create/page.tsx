'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PlusCircle, Minus, ArrowLeft, Link, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { createPromotionProduct, uploadFile } from '@/lib/api';

export default function CreatePromotionProduct() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [productLink, setProductLink] = useState('');
  const [pricingTiers, setPricingTiers] = useState([{ view_count: 1000, points_reward: 100 }]);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const { toast } = useToast();

  const handleAddTier = () => {
    setPricingTiers([...pricingTiers, { view_count: 0, points_reward: 0 }]);
  };

  const handleRemoveTier = (index: number) => {
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  };

  const handleTierChange = (index: number, field: 'view_count' | 'points_reward', value: number) => {
    const updatedTiers = [...pricingTiers];
    updatedTiers[index][field] = value;
    setPricingTiers(updatedTiers);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Error', description: 'Please select an image file' });
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Error', description: 'File size must be less than 10MB' });
        return;
      }

      setImageFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Clear URL input when file is selected
      setImageUrl('');
    }
  };

  const handleRemoveFile = () => {
    setImageFile(null);
    setImagePreview('');
    // Reset file input
    const fileInput = document.getElementById('imageFile') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const uploadImageFile = async (): Promise<string> => {
    if (!imageFile) return '';

    setUploading(true);
    try {
      const response = await uploadFile(imageFile, 'promotion-products');
      return response.url;
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({ title: 'Error', description: 'Failed to upload image' });
      throw error;
    } finally {
      setUploading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Product name is required' });
      return;
    }

    if (pricingTiers.some(tier => tier.view_count <= 0 || tier.points_reward <= 0)) {
      toast({
        title: 'Error',
        description: 'All pricing tiers must have view count and reward amount greater than 0'
      });
      return;
    }

    setLoading(true);

    try {
      let finalImageUrl = imageUrl;

      // Upload file if selected
      if (imageFile) {
        finalImageUrl = await uploadImageFile();
      }

      await createPromotionProduct({
        name,
        description,
        image_url: finalImageUrl,
        product_link: productLink,
        is_active: true,
        pricing_tiers: pricingTiers.map(tier => ({
          view_count: tier.view_count,
          points_reward: tier.points_reward,
        })),
      });

      toast({ title: 'Success', description: 'Promotion product created successfully' });
      router.push('/dashboard/promotion-products');
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create promotion product',
      });
    } finally {
      setLoading(false);
    }
  };

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
          <CardTitle>Create Promotion Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Product Name *</Label>
                <Input 
                  id="name"
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Enter product name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description"
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Enter product description"
                  rows={4}
                />
              </div>
              
              <div>
                <Label htmlFor="image">Product Image</Label>
                <div className="space-y-4">
                  {/* File Upload Option */}
                  <div>
                    <Label className="text-sm font-medium">Upload Image File</Label>
                    <div className="mt-1">
                      <input
                        id="imageFile"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                  </div>

                  {/* Or URL Option */}
                  <div>
                    <Label className="text-sm font-medium">Or Enter Image URL</Label>
                    <Input
                      id="imageUrl"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
                      disabled={!!imageFile}
                    />
                  </div>

                  {/* Image Preview */}
                  {(imagePreview || imageUrl) && (
                    <div className="mt-2">
                      <Label className="text-sm font-medium">Preview</Label>
                      <div className="relative inline-block mt-1">
                        <img
                          src={imagePreview || imageUrl}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-lg border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {imageFile && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6"
                            onClick={handleRemoveFile}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {uploading && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      Uploading image...
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="productLink">Product Link</Label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    id="productLink"
                    value={productLink} 
                    onChange={(e) => setProductLink(e.target.value)} 
                    placeholder="Enter product link (e.g., https://example.com/product)"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This is the link where users can learn more about or purchase the product
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Pricing Tiers *</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddTier}
                    className="flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Tier
                  </Button>
                </div>
                
                {pricingTiers.map((tier, index) => (
                  <div key={index} className="flex items-center gap-3 mb-3 p-3 border rounded">
                    <div className="flex-1">
                      <Label htmlFor={`viewCount-${index}`} className="text-xs">Views</Label>
                      <Input 
                        id={`viewCount-${index}`}
                        type="number"
                        min="1"
                        value={tier.view_count} 
                        onChange={(e) => handleTierChange(index, 'view_count', parseInt(e.target.value) || 0)} 
                        placeholder="Views"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`rewardAmount-${index}`} className="text-xs">Reward (points)</Label>
                      <Input 
                        id={`rewardAmount-${index}`}
                        type="number"
                        min="1"
                        value={tier.points_reward} 
                        onChange={(e) => handleTierChange(index, 'points_reward', parseInt(e.target.value) || 0)} 
                        placeholder="Reward"
                        required
                      />
                    </div>
                    {pricingTiers.length > 1 && (
                      <Button 
                        type="button"
                        variant="destructive" 
                        size="icon"
                        onClick={() => handleRemoveTier(index)}
                        className="self-end mb-0.5"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button
              type="submit"
              disabled={loading || uploading}
              className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white hover:from-blue-600 hover:to-pink-600"
              >
              {(loading || uploading) ? (
                <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 bg-white text-white"></div>
                {uploading ? 'Uploading...' : 'Creating...'}
                </>
              ) : (
                'Create Product'
              )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}