// lib/store.ts
import { FileMetadata } from '@/types';
import PocketBase from 'pocketbase';

const pb = new PocketBase('YOUR_POCKETBASE_URL');

type Subscriber = () => void;

class FileStore {
  private subscribers: Subscriber[] = [];
  private files: FileMetadata[] = [];

  async fetchFiles() {
    try {
      const records = await pb.collection('files').getList(1, 50, {
        sort: '-created',
        expand: 'department'
      });
      
      this.files = records.items.map(record => ({
        id: record.id,
        name: record.name,
        size: record.size,
        type: record.type,
        department: record.expand?.department?.name || record.department,
        archived: record.archived,
        created: record.created,
        url: pb.files.getUrl(record, record.file)
      }));
      
      this.notifySubscribers();
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  }

  async uploadFile(file: File, department: string) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      formData.append('size', file.size.toString());
      formData.append('type', file.type);
      formData.append('department', department);
      formData.append('archived', 'false');

      await pb.collection('files').create(formData);
      await this.fetchFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async updateFile(id: string, data: Partial<FileMetadata>) {
    try {
      await pb.collection('files').update(id, data);
      await this.fetchFiles();
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  getFiles(): FileMetadata[] {
    return this.files;
  }

  subscribe(callback: Subscriber) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback());
  }
}

export const fileStore = new FileStore();