// js/modules/playlistPersist.js
export class PlaylistPersist {
  constructor(key="mp3PlayerPlaylist_v4"){
    this.key = key;
  }

  loadAll(){
    try{
      const raw = localStorage.getItem(this.key);
      if (!raw) return { active:"default", lists:{ default:[] } };
      const obj = JSON.parse(raw);
      if (!obj.lists) obj.lists = { default:[] };
      if (!obj.active) obj.active = "default";
      if (!obj.lists[obj.active]) obj.lists[obj.active] = [];
      return obj;
    }catch{
      // 破損復旧
      return { active:"default", lists:{ default:[] } };
    }
  }

  saveAll(obj){
    try{
      localStorage.setItem(this.key, JSON.stringify(obj));
    }catch{}
  }

  loadActive(){
    const all = this.loadAll();
    return all.lists[all.active] || [];
  }

  saveActive(tracks){
    const all = this.loadAll();
    all.lists[all.active] = tracks;
    this.saveAll(all);
  }

  listNames(){
    const all = this.loadAll();
    return Object.keys(all.lists);
  }

  setActiveName(name){
    const all = this.loadAll();
    if (!all.lists[name]) all.lists[name] = [];
    all.active = name;
    this.saveAll(all);
  }

  createList(name){
    const all = this.loadAll();
    if (!all.lists[name]) all.lists[name] = [];
    this.saveAll(all);
  }

  deleteList(name){
    const all = this.loadAll();
    delete all.lists[name];
    if (!all.lists.default) all.lists.default = [];
    if (!all.lists[all.active]) all.active = "default";
    this.saveAll(all);
  }
}
