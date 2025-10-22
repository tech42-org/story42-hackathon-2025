const Breadcrumb = ({ steps, currentStep }) => {
  return (
    <div className="mb-8 flex justify-center">
      <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 rounded-full border border-gray-200 dark:border-slate-700 shadow-sm p-1">
        {steps.map((step, index) => {
          const isActive = index === currentStep;

          return (
            <button
              key={step.id}
              disabled
              className={`
                px-6 py-2 rounded-full font-medium text-sm transition-all duration-200
                whitespace-nowrap
                ${
                  isActive
                    ? 'bg-[#171A1F] dark:bg-slate-900 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }
              `}
            >
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Breadcrumb;
