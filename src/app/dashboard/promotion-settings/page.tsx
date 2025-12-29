'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'react-hot-toast';
import { getSettings, bulkUpdateSettings, Setting } from '@/lib/api';
import api from '@/lib/api';
import { 
  Settings as SettingsIcon, Save, RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react';

interface PromotionSettings {
  channel_join_reward_points: number;
  channel_join_admin_profit: number;
  video_boost_reward_points: number;
  video_boost_admin_profit: number;
}

export default function PromotionSettingsPage() {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<PromotionSettings>({
    channel_join_reward_points: 0,
    channel_join_admin_profit: 0,
    video_boost_reward_points: 0,
    video_boost_admin_profit: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await getSettings();
        
        // Create a map of settings
        const settingsMap: Record<string, number> = {};
        response.settings.forEach((setting: Setting) => {
          // Ensure value is converted to number
          settingsMap[setting.key] = typeof setting.value === 'number' ? setting.value : Number(setting.value);
        });

        // Update our settings state
        setSettings({
          channel_join_reward_points: settingsMap.channel_join_reward_points || 8,
          channel_join_admin_profit: settingsMap.channel_join_admin_profit || 2,
          video_boost_reward_points: settingsMap.video_boost_reward_points || 6,
          video_boost_admin_profit: settingsMap.video_boost_admin_profit || 2
        });

        setLoading(false);
      } catch (error) {
        toast.error('Failed to fetch settings');
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleInputChange = (key: keyof PromotionSettings, value: string) => {
    // Convert to number and update state
    const numValue = parseInt(value) || 0;
    setSettings(prev => ({
      ...prev,
      [key]: numValue
    }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Convert our settings object to the format expected by the API
      const settingsToUpdate = Object.entries(settings).map(([key, value]) => ({ 
        key, 
        value 
      }));
      
      await bulkUpdateSettings(settingsToUpdate);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold">Promotion Settings</h1>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => getSettings().then(res => {
              const settingsMap: Record<string, number> = {};
              res.settings.forEach((setting: Setting) => {
                // Ensure value is converted to number
                settingsMap[setting.key] = typeof setting.value === 'number' ? setting.value : Number(setting.value);
              });
              setSettings({
                channel_join_reward_points: settingsMap.channel_join_reward_points || 8,
                channel_join_admin_profit: settingsMap.channel_join_admin_profit || 2,
                video_boost_reward_points: settingsMap.video_boost_reward_points || 6,
                video_boost_admin_profit: settingsMap.video_boost_admin_profit || 2
              });
              toast.success('Settings refreshed');
            }).catch(() => toast.error('Failed to refresh settings'))}
            variant="outline"
            size="sm"
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={handleSaveSettings} 
            disabled={saving}
            size="sm"
            className="flex items-center gap-2 bg-white text-gray-800 border border-gray-300 hover:bg-gray-100"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Promotion Cost & Reward Settings</CardTitle>
          <CardDescription>
            Configure the points awarded to users for completing promotion tasks and the admin profit per action
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading settings...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <h3 className="text-lg font-medium">Channel Join Promotion</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="channel_join_reward">Reward per Join (points)</Label>
                      <Input 
                        id="channel_join_reward" 
                        type="number"
                        value={settings.channel_join_reward_points}
                        onChange={(e) => handleInputChange('channel_join_reward_points', e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Points awarded to users for joining a promoted channel
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="channel_join_admin_profit">Admin Profit per Join (points)</Label>
                      <Input 
                        id="channel_join_admin_profit" 
                        type="number"
                        value={settings.channel_join_admin_profit}
                        onChange={(e) => handleInputChange('channel_join_admin_profit', e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Admin profit for each channel join action
                      </p>
                    </div>
                    <div>
                      <Label>Total Cost per Action</Label>
                      <div className="py-2 px-3 bg-muted rounded-md text-lg">
                        {settings.channel_join_reward_points + settings.channel_join_admin_profit} points
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        This is what promoters will be charged per join
                      </p>
                    </div>
                    
                    {/* Example calculation based on instruction.txt */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md mt-4">
                      <h4 className="font-medium mb-2">Example Calculation</h4>
                      <p className="text-sm mb-2">For 100 channel joins:</p>
                      <ul className="text-sm space-y-1 list-disc pl-5">
                        <li>Total cost to promoter: {(settings.channel_join_reward_points + settings.channel_join_admin_profit) * 100} points</li>
                        <li>Total rewards to participants: {settings.channel_join_reward_points * 100} points</li>
                        <li>Total admin profit: {settings.channel_join_admin_profit * 100} points</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-lg font-medium">Video Boost Promotion</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="video_boost_reward">Reward per View (points)</Label>
                      <Input 
                        id="video_boost_reward" 
                        type="number"
                        value={settings.video_boost_reward_points}
                        onChange={(e) => handleInputChange('video_boost_reward_points', e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Points awarded to users for watching a promoted video
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="video_boost_admin_profit">Admin Profit per View (points)</Label>
                      <Input 
                        id="video_boost_admin_profit" 
                        type="number"
                        value={settings.video_boost_admin_profit}
                        onChange={(e) => handleInputChange('video_boost_admin_profit', e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Admin profit for each video view action
                      </p>
                    </div>
                    <div>
                      <Label>Total Cost per Action</Label>
                      <div className="py-2 px-3 bg-muted rounded-md text-lg">
                        {settings.video_boost_reward_points + settings.video_boost_admin_profit} points
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        This is what promoters will be charged per view
                      </p>
                    </div>
                    
                    {/* Example calculation based on instruction.txt */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md mt-4">
                      <h4 className="font-medium mb-2">Example Calculation</h4>
                      <p className="text-sm mb-2">For 100 video views:</p>
                      <ul className="text-sm space-y-1 list-disc pl-5">
                        <li>Total cost to promoter: {(settings.video_boost_reward_points + settings.video_boost_admin_profit) * 100} points</li>
                        <li>Total rewards to participants: {settings.video_boost_reward_points * 100} points</li>
                        <li>Total admin profit: {settings.video_boost_admin_profit * 100} points</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button 
                  onClick={handleSaveSettings} 
                  disabled={saving}
                  className="w-full md:w-auto bg-white text-gray-800 border border-gray-300 hover:bg-gray-100"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Promotion Economics Work</CardTitle>
          <CardDescription>
            Understanding how promotions are priced and how rewards are distributed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Cost Structure</h3>
            <p className="text-sm text-gray-500">
              For each promotion, there are two components to the cost:
            </p>
            <ul className="list-disc pl-5 text-sm text-gray-500 space-y-1">
              <li><span className="font-medium">Reward to participants</span>: Points awarded to users who complete the task</li>
              <li><span className="font-medium">Admin profit</span>: Points kept by the platform for each completed task</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold">Example</h3>
            <p className="text-sm text-gray-500">
              With current settings, for a channel join promotion targeting 100 users:
            </p>
            <div className="bg-gray-50 p-4 rounded-md text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>Cost per join:</div>
                <div className="font-medium">{settings.channel_join_reward_points + settings.channel_join_admin_profit} points</div>
                
                <div>Reward per user:</div>
                <div className="font-medium">{settings.channel_join_reward_points} points</div>
                
                <div>Admin profit per join:</div>
                <div className="font-medium">{settings.channel_join_admin_profit} points</div>
                
                <div className="border-t pt-1 mt-1">Total budget needed:</div>
                <div className="border-t pt-1 mt-1 font-semibold">{(settings.channel_join_reward_points + settings.channel_join_admin_profit) * 100} points</div>
                
                <div>Total rewards to users:</div>
                <div className="font-medium">{settings.channel_join_reward_points * 100} points</div>
                
                <div>Total admin profit:</div>
                <div className="font-medium text-green-600">{settings.channel_join_admin_profit * 100} points</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
