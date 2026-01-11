import { BetweenVerticalEnd, FolderClosed, Settings } from 'lucide-react'

function BottomNavigation() {
  return (
  <div className='fixed bottom-0 left-0 right-0 h-[70px] bg-[var(--bottom-nav)] flex items-center justify-evenly'>
      <button><FolderClosed size={30}/></button>
      <button className='bg-black rounded-full p-[20px] -mt-[30px]'><BetweenVerticalEnd size={30} color='white'/></button>
      <button><Settings size={30}/></button>
    </div>
  )
}

export default BottomNavigation
